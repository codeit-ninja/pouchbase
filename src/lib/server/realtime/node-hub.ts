import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { InternalCall } from './hub-core.ts';

import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

import { CLOSE, LIMITS, PING_FRAME, PONG_FRAME, REALTIME_PATH } from '../../realtime/protocol.ts';
import { HubCore, MemoryStore } from './hub-core.ts';
import { internalSecret } from './internal-secret.ts';

/**
 * The realtime hub of the Node target and of `vite dev`: a `ws` server in the same process as the
 * app. `server.mjs` (and `vite/realtime.ts` in development) hand it the HTTP upgrades of
 * `/api/realtime`; SvelteKit can't answer those itself. It keeps one `HubCore` per collection, and
 * reaches the app's internal routes over loopback.
 *
 * The hub lives on `globalThis`, so the server entry and the app's broker (`broker/node.ts`) find
 * the same one, even when Vite loads this module more than once.
 */

const KEY = Symbol.for('pouchbase.realtime.hub');
const COLLECTION_NAME = /^[a-z][a-z0-9_]{0,62}$/;
/** How often deadlines and expiries are checked while sockets are open. */
const TICK_MS = 1000;

type Connection = { ws: WebSocket; core: HubCore; alive: boolean };

/** Whether the upgrade came from a page of this origin, so its cookies may be used. */
function sameOrigin(request: IncomingMessage) {
	const origin = request.headers.origin;
	const forwarded = request.headers['x-forwarded-host'];
	const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? request.headers.host;

	if (!origin || !host) {
		return false;
	}

	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

/** The address this server answers on, for calls to itself. */
function loopbackUrl(socket: Duplex) {
	const { localAddress, localPort } = socket as Duplex & {
		localAddress?: string;
		localPort?: number;
	};
	const address = (localAddress ?? '127.0.0.1').replace(/^::ffff:/, '');
	const host =
		address === '0.0.0.0' || address === '::'
			? '127.0.0.1'
			: address.includes(':')
				? `[${address}]`
				: address;

	return `http://${host}:${localPort ?? 80}`;
}

export class NodeHub {
	readonly #server = new WebSocketServer({
		noServer: true,
		maxPayload: LIMITS.MAX_MESSAGE_BYTES
	});
	readonly #cores = new Map<string, HubCore>();
	readonly #connections = new Map<string, Connection>();
	#baseUrl: string | null = null;
	#ticker: ReturnType<typeof setInterval> | null = null;
	#heartbeat: ReturnType<typeof setInterval> | null = null;

	/**
	 * Takes over an HTTP upgrade. Returns `false` when it isn't for `/api/realtime`, so the caller
	 * can hand it to someone else (Vite's HMR socket) or close it.
	 */
	upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
		const url = new URL(request.url ?? '/', 'http://localhost');

		if (url.pathname !== REALTIME_PATH) {
			return false;
		}

		this.#baseUrl ??= loopbackUrl(socket);

		const collection = url.searchParams.get('collection') ?? '';
		const cookie = sameOrigin(request) ? (request.headers.cookie ?? null) : null;

		this.#server.handleUpgrade(request, socket, head, (ws) => {
			if (!COLLECTION_NAME.test(collection)) {
				ws.close(CLOSE.INVALID_COLLECTION, 'Invalid collection');
				return;
			}

			const id = randomUUID();
			const core = this.#core(collection);
			const connection: Connection = { ws, core, alive: true };

			this.#connections.set(id, connection);
			core.open(id, cookie);
			this.#start();

			ws.on('pong', () => {
				connection.alive = true;
			});

			ws.on('message', (data) => {
				connection.alive = true;

				const text = Array.isArray(data)
					? Buffer.concat(data).toString()
					: Buffer.from(data as ArrayBuffer).toString();

				if (text === PING_FRAME) {
					ws.send(PONG_FRAME);
					return;
				}

				core.message(id, text).catch((error: unknown) => {
					console.error('[realtime]', error);
				});
			});

			ws.on('close', () => {
				this.#connections.delete(id);
				core.closed(id);
				this.#stopWhenIdle();
			});

			ws.on('error', (error) => {
				console.error('[realtime] socket error', error);
			});
		});

		return true;
	}

	/** Sends saved changes to the hub of their collection. */
	async publish(events: Parameters<HubCore['publish']>[0]) {
		const collection = events[0]?.collection;
		const core = collection && this.#cores.get(collection);

		if (core) {
			await core.publish(events);
		}
	}

	/** Closes every socket, e.g. when the server shuts down. */
	close(code: number = CLOSE.GOING_AWAY, reason = 'Server shutting down') {
		for (const { ws } of this.#connections.values()) {
			ws.close(code, reason);
		}

		this.#connections.clear();
		this.#stopWhenIdle();
	}

	#core(collection: string) {
		let core = this.#cores.get(collection);

		if (!core) {
			core = new HubCore({
				collection,
				store: new MemoryStore(),
				transport: {
					send: (socketId, message) => {
						const ws = this.#connections.get(socketId)?.ws;

						if (ws?.readyState === WebSocket.OPEN) {
							ws.send(JSON.stringify(message));
						}
					},
					close: (socketId, code, reason) => {
						this.#connections.get(socketId)?.ws.close(code, reason);
						this.#connections.delete(socketId);
					}
				},
				internal: this.#internal
			});
			this.#cores.set(collection, core);
		}

		return core;
	}

	readonly #internal: InternalCall = async (path, body, cookie) => {
		const response = await fetch(`${this.#baseUrl}/internal/realtime/${path}`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${internalSecret()}`,
				// JSON, so SvelteKit doesn't take it for a cross-site form submission.
				'content-type': 'application/json',
				...(cookie ? { cookie } : {})
			},
			body: JSON.stringify(body)
		});

		return { status: response.status, body: await response.json().catch(() => null) };
	};

	#start() {
		this.#ticker ??= setInterval(() => {
			for (const core of this.#cores.values()) {
				core.tick();
			}
		}, TICK_MS);
		this.#ticker.unref();

		// Sockets whose client went away without closing (no pong for a whole interval) are dropped.
		this.#heartbeat ??= setInterval(() => {
			for (const [id, connection] of this.#connections) {
				if (!connection.alive) {
					connection.ws.terminate();
					this.#connections.delete(id);
					connection.core.closed(id);
					continue;
				}

				connection.alive = false;
				connection.ws.ping();
			}
		}, LIMITS.PING_INTERVAL_MS);
		this.#heartbeat.unref();
	}

	#stopWhenIdle() {
		if (this.#connections.size) {
			return;
		}

		if (this.#ticker) {
			clearInterval(this.#ticker);
			this.#ticker = null;
		}

		if (this.#heartbeat) {
			clearInterval(this.#heartbeat);
			this.#heartbeat = null;
		}
	}
}

type WithHub = typeof globalThis & { [KEY]?: NodeHub };

/** The hub of this process, made on first use. */
export function nodeHub(): NodeHub {
	const scope = globalThis as WithHub;

	scope[KEY] ??= new NodeHub();

	return scope[KEY];
}
