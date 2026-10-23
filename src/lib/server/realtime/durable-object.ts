import type { HubStore, InternalCall, RecordEvent, Subject, Subscription } from './hub-core.ts';

import { DurableObject } from 'cloudflare:workers';

import { CLOSE, PING_FRAME, PONG_FRAME } from '../../realtime/protocol.ts';
import { HubCore } from './hub-core.ts';
import { internalSecret } from './internal-secret.ts';

/**
 * The realtime hub on Workers: one Durable Object per collection (`env.REALTIME.getByName(name)`),
 * holding that collection's sockets with the WebSocket Hibernation API, so an idle socket costs
 * nothing. Sockets and subscriptions are kept in the object's SQLite storage and survive
 * hibernation; the attachment of a socket would be too small for them.
 *
 * `scripts/worker-entry.mjs` exports the class from the Worker and sends the upgrades of
 * `/api/realtime` here, before SvelteKit (which can't answer them). The object runs the app's
 * handler in its own isolate for the internal routes, so it needs no network for them.
 *
 * Only relative imports: Wrangler bundles this file, not Vite.
 */

type Handler = {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};

type Row = Record<string, SqlStorageValue>;

function parseSubject(value: SqlStorageValue): Subject | null {
	return typeof value === 'string' ? (JSON.parse(value) as Subject) : null;
}

function toSubscription(row: Row): Subscription {
	return {
		id: String(row.id),
		record: row.record === null ? null : String(row.record),
		filter: row.filter === null ? null : String(row.filter),
		fields: row.fields === null ? null : (JSON.parse(String(row.fields)) as string[]),
		expand:
			row.expand === null || row.expand === undefined
				? null
				: (JSON.parse(String(row.expand)) as string[])
	};
}

/** A `HubStore` in the Durable Object's SQLite storage (synchronous). */
class SqlStore implements HubStore {
	readonly #sql: SqlStorage;

	constructor(sql: SqlStorage) {
		this.#sql = sql;
	}

	addSocket(socket: { id: string; cookie: string | null; deadline: number }) {
		this.#sql.exec(
			'INSERT OR REPLACE INTO sockets (id, cookie, deadline) VALUES (?, ?, ?)',
			socket.id,
			socket.cookie,
			socket.deadline
		);
	}

	socket(id: string) {
		const [row] = this.#sql.exec<Row>('SELECT * FROM sockets WHERE id = ?', id).toArray();

		if (!row) {
			return null;
		}

		return {
			id,
			subject: parseSubject(row.subject),
			expiresAt: row.expires_at === null ? null : Number(row.expires_at),
			deadline: row.deadline === null ? null : Number(row.deadline),
			cookie: row.cookie === null ? null : String(row.cookie)
		};
	}

	authenticate(id: string, subject: Subject, expiresAt: number | null) {
		this.#sql.exec(
			// The cookie was only needed to authenticate.
			'UPDATE sockets SET subject = ?, expires_at = ?, deadline = NULL, cookie = NULL WHERE id = ?',
			JSON.stringify(subject),
			expiresAt,
			id
		);
	}

	removeSocket(id: string) {
		this.#sql.exec('DELETE FROM subscriptions WHERE socket_id = ?', id);
		this.#sql.exec('DELETE FROM sockets WHERE id = ?', id);
	}

	subscriptions(socketId: string) {
		return this.#sql
			.exec<Row>('SELECT * FROM subscriptions WHERE socket_id = ?', socketId)
			.toArray()
			.map(toSubscription);
	}

	addSubscription(socketId: string, subscription: Subscription) {
		this.#sql.exec(
			'INSERT OR REPLACE INTO subscriptions (socket_id, id, record, filter, fields, expand) VALUES (?, ?, ?, ?, ?, ?)',
			socketId,
			subscription.id,
			subscription.record,
			subscription.filter,
			subscription.fields && JSON.stringify(subscription.fields),
			subscription.expand && JSON.stringify(subscription.expand)
		);
	}

	removeSubscription(socketId: string, id: string) {
		this.#sql.exec('DELETE FROM subscriptions WHERE socket_id = ? AND id = ?', socketId, id);
	}

	subscribers(recordId: string) {
		return this.#sql
			.exec<Row>(
				`SELECT subscriptions.*, sockets.subject FROM subscriptions
				JOIN sockets ON sockets.id = subscriptions.socket_id
				WHERE sockets.subject IS NOT NULL AND (subscriptions.record IS NULL OR subscriptions.record = ?)`,
				recordId
			)
			.toArray()
			.map((row) => ({
				socketId: String(row.socket_id),
				subject: parseSubject(row.subject)!,
				subscription: toSubscription(row)
			}));
	}

	due(now: number) {
		return this.#sql
			.exec<Row>(
				'SELECT id, deadline FROM sockets WHERE deadline <= ? OR expires_at <= ?',
				now,
				now
			)
			.toArray()
			.map((row) =>
				row.deadline !== null && Number(row.deadline) <= now
					? { id: String(row.id), code: CLOSE.AUTH_TIMEOUT, reason: 'No auth message' }
					: { id: String(row.id), code: CLOSE.UNAUTHORIZED, reason: 'Token expired' }
			);
	}

	nextWake() {
		const [row] = this.#sql
			.exec<Row>(
				'SELECT min(coalesce(deadline, expires_at), coalesce(expires_at, deadline)) AS next FROM sockets'
			)
			.toArray();

		return row?.next === null || row?.next === undefined ? null : Number(row.next);
	}
}

/** The Durable Object class, running `handler` (the SvelteKit Worker) for the internal routes. */
export function realtimeHub(handler: Handler) {
	return class RealtimeHub extends DurableObject<Env> {
		#core: HubCore | null = null;

		constructor(ctx: DurableObjectState, env: Env) {
			super(ctx, env);

			ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
				CREATE TABLE IF NOT EXISTS sockets (
					id TEXT PRIMARY KEY,
					cookie TEXT,
					subject TEXT,
					expires_at INTEGER,
					deadline INTEGER
				);
				CREATE TABLE IF NOT EXISTS subscriptions (
					socket_id TEXT NOT NULL,
					id TEXT NOT NULL,
					record TEXT,
					filter TEXT,
					fields TEXT,
					expand TEXT,
					PRIMARY KEY (socket_id, id)
				);
				CREATE INDEX IF NOT EXISTS subscriptions_record ON subscriptions (record);
			`);

			// Hubs created before `expand` existed have a table without it.
			const columns = ctx.storage.sql
				.exec<Row>('PRAGMA table_info(subscriptions)')
				.toArray()
				.map((column) => String(column.name));

			if (!columns.includes('expand')) {
				ctx.storage.sql.exec('ALTER TABLE subscriptions ADD COLUMN expand TEXT');
			}

			// Answered by the runtime, without waking the object.
			ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_FRAME, PONG_FRAME));
		}

		/** An upgrade of `/api/realtime?collection=<name>`, from the Worker entry. */
		async fetch(request: Request): Promise<Response> {
			const url = new URL(request.url);

			this.#remember('collection', url.searchParams.get('collection') ?? '');
			this.#remember('origin', url.origin);

			const pair = new WebSocketPair();
			const [client, server] = [pair[0], pair[1]];
			const id = crypto.randomUUID();
			const origin = request.headers.get('origin');
			let cookie: string | null = null;

			try {
				cookie = origin && new URL(origin).host === url.host ? request.headers.get('cookie') : null;
			} catch {
				// An invalid Origin header: no cookies.
			}

			this.ctx.acceptWebSocket(server, [id]);
			this.#hub().open(id, cookie);
			await this.#schedule();

			return new Response(null, { status: 101, webSocket: client });
		}

		/** Saved changes of this collection, from `broker/workers.ts` (RPC). */
		async publish(events: RecordEvent[]) {
			await this.#hub().publish(events);
		}

		async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
			const [id] = this.ctx.getTags(ws);
			const text = typeof message === 'string' ? message : new TextDecoder().decode(message);

			if (id) {
				await this.#hub().message(id, text);
				await this.#schedule();
			}
		}

		async webSocketClose(ws: WebSocket) {
			const [id] = this.ctx.getTags(ws);

			if (id) {
				this.#hub().closed(id);
			}
		}

		async webSocketError(ws: WebSocket) {
			await this.webSocketClose(ws);
		}

		/** Closes sockets past their auth deadline or token expiry. */
		async alarm() {
			this.#hub().tick();
			await this.#schedule();
		}

		#hub() {
			this.#core ??= new HubCore({
				collection: this.#recall('collection') ?? '',
				store: new SqlStore(this.ctx.storage.sql),
				transport: {
					send: (socketId, message) => {
						for (const ws of this.ctx.getWebSockets(socketId)) {
							try {
								ws.send(JSON.stringify(message));
							} catch {
								// Already closing.
							}
						}
					},
					close: (socketId, code, reason) => {
						for (const ws of this.ctx.getWebSockets(socketId)) {
							try {
								ws.close(code, reason);
							} catch {
								// Already closed.
							}
						}
					}
				},
				internal: this.#internal
			});

			return this.#core;
		}

		readonly #internal: InternalCall = async (path, body, cookie) => {
			const origin = this.#recall('origin') ?? 'https://pouchbase.internal';
			const request = new Request(`${origin}/internal/realtime/${path}`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${internalSecret()}`,
					// JSON, so SvelteKit doesn't take it for a cross-site form submission.
					'content-type': 'application/json',
					...(cookie ? { cookie } : {})
				},
				body: JSON.stringify(body)
			});
			const response = await handler.fetch(
				request,
				this.env,
				this.ctx as unknown as ExecutionContext
			);

			return { status: response.status, body: await response.json().catch(() => null) };
		};

		async #schedule() {
			const next = this.#hub().tick();

			if (next === null) {
				return;
			}

			const current = await this.ctx.storage.getAlarm();

			if (current === null || next < current) {
				await this.ctx.storage.setAlarm(next);
			}
		}

		#remember(key: string, value: string) {
			if (value && this.#recall(key) !== value) {
				this.ctx.storage.sql.exec(
					'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
					key,
					value
				);
			}
		}

		#recall(key: string) {
			const [row] = this.ctx.storage.sql
				.exec<Row>('SELECT value FROM meta WHERE key = ?', key)
				.toArray();

			return row ? String(row.value) : null;
		}
	};
}
