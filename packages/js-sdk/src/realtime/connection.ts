import { PouchbaseError } from '../error.js';
import { CLOSE, PING_FRAME, PING_INTERVAL_MS, PONG_FRAME } from './protocol.js';
import type { RealtimeAction, RealtimeErrorCode, ServerMessage } from './protocol.js';

/** The `WebSocket` class to connect with: the global one, or one passed in (tests, older Node). */
export type WebSocketLike = {
	new (url: string): WebSocketInstance;
};

/** What `RealtimeConnection` uses of a WebSocket. */
export type WebSocketInstance = {
	readonly readyState: number;
	send(data: string): void;
	close(code?: number, reason?: string): void;
	onopen: ((event: unknown) => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event: { code: number; reason: string }) => void) | null;
	onerror: ((event: unknown) => void) | null;
};

/** A change to a record, as a subscription receives it. */
export type RealtimeEvent<T = Record<string, unknown>> = {
	action: RealtimeAction;
	/** The record as the records API returns it; for `delete`, as it was. */
	record: T;
	/** When the change was saved (ms since the epoch). */
	at: number;
};

/** What a subscription asks for. */
export type SubscriptionRequest = {
	/** One record, or every record of the collection when missing. */
	record?: string;
	/** A filter expression (see `filter` and `where`). */
	filter?: string;
	/** Only these fields of each record. */
	fields?: string[];
	/** Relations to send as records: `author`, `comments.author`. */
	expand?: string[];
};

/** A running subscription. */
export type RealtimeSubscription = {
	/**
	 * Settles when the server accepted the subscription. Rejects with a `PouchbaseError`:
	 * `forbidden` (the view rule doesn't allow it), `not_found` (no such collection), `invalid`
	 * (a bad filter or field) or `unauthorized` (the token was rejected).
	 */
	readonly ready: Promise<void>;
	/** Stops the subscription; the connection closes when it was the last one. */
	unsubscribe(): void;
};

/** The state of a connection, for a status indicator. */
export type ConnectionState = 'connecting' | 'open' | 'closed';

const OPEN = 1;
/** How long to wait for a pong before the connection counts as lost. */
const PONG_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

const STATUS: Record<RealtimeErrorCode, number> = {
	invalid_message: 400,
	not_authenticated: 401,
	collection_not_found: 404,
	forbidden: 403,
	invalid_filter: 400,
	too_many_subscriptions: 400,
	duplicate_id: 400,
	server_error: 500
};

type Entry = {
	request: SubscriptionRequest;
	listener: (event: RealtimeEvent) => void;
	onError?: (error: PouchbaseError) => void;
	accepted: boolean;
	resolve: () => void;
	reject: (error: PouchbaseError) => void;
};

/**
 * One WebSocket to `/api/realtime?collection=<name>`: it opens when the first subscription starts
 * and closes after the last one stops. It authenticates with the current token, (re)subscribes
 * everything once the server is ready, answers the heartbeat and reconnects with a growing delay
 * after the connection is lost. A changed token reconnects it, since the rules then see someone
 * else. Used by `pb.realtime`; you rarely need it directly.
 */
export class RealtimeConnection {
	readonly url: string;
	readonly #WebSocket: WebSocketLike;
	readonly #token: () => string;
	readonly #onState?: (state: ConnectionState) => void;
	readonly #entries = new Map<string, Entry>();
	#socket: WebSocketInstance | null = null;
	/** The token the open socket authenticated with. */
	#connectedToken = '';
	#ready = false;
	#attempt = 0;
	#nextId = 1;
	#reconnect: ReturnType<typeof setTimeout> | null = null;
	#ping: ReturnType<typeof setInterval> | null = null;
	#pongDeadline: ReturnType<typeof setTimeout> | null = null;

	constructor(options: {
		/** The `ws:` or `wss:` URL, with `?collection=<name>`. */
		url: string;
		/** The current token, or `''` for an anonymous connection. */
		token: () => string;
		webSocket?: WebSocketLike;
		onState?: (state: ConnectionState) => void;
	}) {
		const WebSocketClass =
			options.webSocket ?? (globalThis as { WebSocket?: WebSocketLike }).WebSocket;

		if (!WebSocketClass) {
			throw new PouchbaseError(
				'This runtime has no WebSocket; pass one with the `webSocket` option of `new Pouchbase()`'
			);
		}

		this.url = options.url;
		this.#WebSocket = WebSocketClass;
		this.#token = options.token;
		this.#onState = options.onState;
	}

	/** Starts a subscription; `listener` gets every event it matches. */
	subscribe(
		request: SubscriptionRequest,
		listener: (event: RealtimeEvent) => void,
		onError?: (error: PouchbaseError) => void
	): RealtimeSubscription {
		const id = `s${this.#nextId++}`;
		let entry!: Entry;
		const ready = new Promise<void>((resolve, reject) => {
			entry = { request, listener, onError, accepted: false, resolve, reject };
		});

		// Handled here, so a caller that doesn't await `ready` gets no unhandled rejection.
		ready.catch(() => undefined);
		this.#entries.set(id, entry);

		if (this.#socket && this.#ready) {
			this.#send({ type: 'subscribe', id, ...request });
		} else {
			this.#connect();
		}

		return {
			ready,
			unsubscribe: () => {
				if (!this.#entries.delete(id)) {
					return;
				}

				if (this.#ready) {
					this.#send({ type: 'unsubscribe', id });
				}

				if (!this.#entries.size) {
					this.close();
				}
			}
		};
	}

	/** Reconnects when the token changed since the socket authenticated. */
	tokenChanged(): void {
		if (this.#socket && this.#token() !== this.#connectedToken) {
			this.#drop();
			this.#connect();
		} else if (!this.#socket && this.#entries.size && !this.#reconnect) {
			// Stopped after an unauthorized close; a new token may be accepted.
			this.#connect();
		}
	}

	/** Closes the socket and forgets every subscription. */
	close(): void {
		this.#entries.clear();
		this.#drop();
		this.#onState?.('closed');
	}

	#connect() {
		if (this.#socket) {
			return;
		}

		if (this.#reconnect) {
			clearTimeout(this.#reconnect);
			this.#reconnect = null;
		}

		const socket = new this.#WebSocket(this.url);

		this.#socket = socket;
		this.#ready = false;
		this.#connectedToken = this.#token();
		this.#onState?.('connecting');

		socket.onopen = () => {
			const token = this.#connectedToken;

			socket.send(JSON.stringify(token ? { type: 'auth', token } : { type: 'auth' }));
			this.#startHeartbeat(socket);
		};

		socket.onmessage = (event) => {
			if (socket !== this.#socket) {
				return;
			}

			this.#alive();

			if (event.data === PONG_FRAME || typeof event.data !== 'string') {
				return;
			}

			let message: ServerMessage;

			try {
				message = JSON.parse(event.data) as ServerMessage;
			} catch {
				return;
			}

			this.#handle(message);
		};

		socket.onclose = (event) => {
			if (socket === this.#socket) {
				this.#closed(event.code, event.reason);
			}
		};

		// A failed connection also closes; reconnecting happens there.
		socket.onerror = () => undefined;
	}

	#handle(message: ServerMessage) {
		switch (message.type) {
			case 'ready':
				this.#ready = true;
				this.#attempt = 0;
				this.#onState?.('open');

				for (const [id, entry] of this.#entries) {
					this.#send({ type: 'subscribe', id, ...entry.request });
				}

				return;
			case 'subscribed': {
				const entry = this.#entries.get(message.id);

				if (entry) {
					entry.accepted = true;
					entry.resolve();
				}

				return;
			}
			case 'event':
				this.#entries.get(message.id)?.listener({
					action: message.action,
					record: message.record,
					at: message.at
				});
				return;
			case 'error': {
				const entry = message.id ? this.#entries.get(message.id) : undefined;

				if (entry && message.id) {
					this.#entries.delete(message.id);
					this.#fail(entry, this.#error(message.code, message.message));
				}

				return;
			}
		}
	}

	#closed(code: number, reason: string) {
		this.#drop();

		if (!this.#entries.size) {
			this.#onState?.('closed');
			return;
		}

		// Not retried: the token, the collection or the client is wrong.
		if (
			code === CLOSE.UNAUTHORIZED ||
			code === CLOSE.INVALID_COLLECTION ||
			code === CLOSE.PROTOCOL_ERROR
		) {
			const error =
				code === CLOSE.UNAUTHORIZED
					? new PouchbaseError(reason || 'Invalid or expired token', { status: 401 })
					: new PouchbaseError(reason || 'Realtime connection refused', { status: 400 });

			for (const entry of this.#entries.values()) {
				if (!entry.accepted || code !== CLOSE.UNAUTHORIZED) {
					this.#fail(entry, error);
				}
			}

			// After an unauthorized close, accepted subscriptions wait for a new token
			// (`tokenChanged()`); the others are gone.
			for (const [id, entry] of this.#entries) {
				if (!entry.accepted || code !== CLOSE.UNAUTHORIZED) {
					this.#entries.delete(id);
				}
			}

			this.#onState?.('closed');
			return;
		}

		const delay = Math.min(1000 * 2 ** this.#attempt, MAX_BACKOFF_MS);

		this.#attempt++;
		this.#onState?.('connecting');
		this.#reconnect = setTimeout(
			() => {
				this.#reconnect = null;
				this.#connect();
			},
			delay / 2 + Math.random() * (delay / 2)
		);
	}

	#fail(entry: Entry, error: PouchbaseError) {
		entry.reject(error);
		entry.onError?.(error);
	}

	#error(code: RealtimeErrorCode, message: string) {
		return new PouchbaseError(message, { status: STATUS[code] ?? 500, code });
	}

	#send(message: object) {
		if (this.#socket?.readyState === OPEN) {
			this.#socket.send(JSON.stringify(message));
		}
	}

	#startHeartbeat(socket: WebSocketInstance) {
		this.#stopHeartbeat();
		this.#ping = setInterval(() => {
			if (socket.readyState !== OPEN) {
				return;
			}

			socket.send(PING_FRAME);
			this.#pongDeadline ??= setTimeout(() => {
				// No answer: the connection is gone without a close.
				if (socket === this.#socket) {
					socket.close(CLOSE.NORMAL, 'No pong');
					this.#closed(CLOSE.GOING_AWAY, 'No pong');
				}
			}, PONG_TIMEOUT_MS);
		}, PING_INTERVAL_MS);
	}

	#alive() {
		if (this.#pongDeadline) {
			clearTimeout(this.#pongDeadline);
			this.#pongDeadline = null;
		}
	}

	#stopHeartbeat() {
		if (this.#ping) {
			clearInterval(this.#ping);
			this.#ping = null;
		}

		this.#alive();
	}

	/** Closes the socket without reconnecting. */
	#drop() {
		this.#stopHeartbeat();

		if (this.#reconnect) {
			clearTimeout(this.#reconnect);
			this.#reconnect = null;
		}

		const socket = this.#socket;

		this.#socket = null;
		this.#ready = false;

		if (socket) {
			socket.onopen = null;
			socket.onmessage = null;
			socket.onclose = null;
			socket.onerror = null;

			try {
				socket.close(CLOSE.NORMAL);
			} catch {
				// Already closed.
			}
		}
	}
}
