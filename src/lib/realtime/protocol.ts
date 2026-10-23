/**
 * The realtime protocol: messages over the WebSocket at `/api/realtime?collection=<name>`, which
 * sends the create, update and delete events of one collection's records. A client opens one
 * socket per collection, sends `auth` first and then subscribes to every record or to one.
 *
 * Shared by the hubs (the Durable Object on Workers, `ws` on Node) and the dashboard. Mirrored in
 * `packages/js-sdk/src/realtime/protocol.ts`; keep both in sync.
 */

export const REALTIME_PATH = '/api/realtime';

export type RealtimeAction = 'create' | 'update' | 'delete';

/** Who the socket belongs to, as `ready` reports it. */
export type RealtimeSubjectKind = 'admin' | 'user' | 'anonymous';

export type ClientMessage =
	/** The first message: the token of an app user, or none (anonymous, or the dashboard's session). */
	| { type: 'auth'; token?: string }
	/**
	 * Every record of the collection, or the one with id `record`; `filter`, `fields` and `expand`
	 * (`["author", "comments.author"]`) as in the records API.
	 */
	| {
			type: 'subscribe';
			id: string;
			record?: string;
			filter?: string;
			fields?: string[];
			expand?: string[];
	  }
	| { type: 'unsubscribe'; id: string };

export type ServerMessage =
	| { type: 'ready'; subject: RealtimeSubjectKind; expiresAt: number | null }
	| { type: 'subscribed'; id: string }
	| { type: 'unsubscribed'; id: string }
	| {
			type: 'event';
			/** The subscription it matched. */
			id: string;
			action: RealtimeAction;
			/** As the records API returns it; for `delete`, the record as it was. */
			record: Record<string, unknown>;
			/** When the change was saved (ms). */
			at: number;
	  }
	| { type: 'error'; id?: string; code: RealtimeErrorCode; message: string };

export type RealtimeErrorCode =
	/** Not JSON, an unknown type, or missing or invalid properties. */
	| 'invalid_message'
	/** `subscribe` before `auth`, or `auth` twice. */
	| 'not_authenticated'
	| 'collection_not_found'
	/** The API doesn't offer `view` for this collection, or its view rule is locked or invalid. */
	| 'forbidden'
	/** The filter doesn't compile, `fields` names a field that doesn't exist, or `expand` is invalid. */
	| 'invalid_filter'
	| 'too_many_subscriptions'
	| 'duplicate_id'
	/** The server couldn't check the subscription. */
	| 'server_error';

/** Close codes; 4xxx are Pouchbase's own. */
export const CLOSE = {
	NORMAL: 1000,
	/** A deploy or restart; clients reconnect. */
	GOING_AWAY: 1001,
	MESSAGE_TOO_BIG: 1009,
	INTERNAL: 1011,
	/** Too many invalid messages in a row. */
	PROTOCOL_ERROR: 4000,
	/** No `auth` within `LIMITS.AUTH_DEADLINE_MS`. */
	AUTH_TIMEOUT: 4001,
	/** The query parameter `collection` is missing or invalid. */
	INVALID_COLLECTION: 4004,
	/** The token is invalid, or expired while connected. */
	UNAUTHORIZED: 4401
} as const;

export const LIMITS = {
	AUTH_DEADLINE_MS: 10_000,
	MAX_SUBSCRIPTIONS: 100,
	MAX_MESSAGE_BYTES: 32 * 1024,
	/** Invalid messages in a row before the socket is closed. */
	MAX_STRIKES: 5,
	PING_INTERVAL_MS: 30_000
} as const;

/**
 * The heartbeat. The server answers it without parsing (on Workers without waking the Durable
 * Object), so both sides send exactly these strings.
 */
export const PING_FRAME = '{"type":"ping"}';
export const PONG_FRAME = '{"type":"pong"}';
