/**
 * The realtime protocol: messages over the WebSocket at `/api/realtime?collection=<name>`.
 * Mirrors `src/lib/realtime/protocol.ts` of the app; keep both in sync.
 */

export const REALTIME_PATH = '/api/realtime';

export type RealtimeAction = 'create' | 'update' | 'delete';

export type RealtimeSubjectKind = 'admin' | 'user' | 'anonymous';

export type ClientMessage =
	| { type: 'auth'; token?: string }
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
			id: string;
			action: RealtimeAction;
			record: Record<string, unknown>;
			at: number;
	  }
	| { type: 'error'; id?: string; code: RealtimeErrorCode; message: string }
	| { type: 'pong' };

export type RealtimeErrorCode =
	| 'invalid_message'
	| 'not_authenticated'
	| 'collection_not_found'
	| 'forbidden'
	| 'invalid_filter'
	| 'too_many_subscriptions'
	| 'duplicate_id'
	| 'server_error';

export const CLOSE = {
	NORMAL: 1000,
	GOING_AWAY: 1001,
	MESSAGE_TOO_BIG: 1009,
	INTERNAL: 1011,
	PROTOCOL_ERROR: 4000,
	AUTH_TIMEOUT: 4001,
	INVALID_COLLECTION: 4004,
	UNAUTHORIZED: 4401
} as const;

export const PING_INTERVAL_MS = 30_000;

export const PING_FRAME = '{"type":"ping"}';
export const PONG_FRAME = '{"type":"pong"}';
