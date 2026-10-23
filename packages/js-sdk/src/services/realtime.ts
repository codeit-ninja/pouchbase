import type { Pouchbase } from '../client.js';
import type { PouchbaseError } from '../error.js';
import { compileInclude, compileSelect, compileWhere } from '../query.js';
import type { Filter, Where } from '../query.js';
import { RealtimeConnection } from '../realtime/connection.js';
import type {
	ConnectionState,
	RealtimeEvent,
	RealtimeSubscription,
	WebSocketLike
} from '../realtime/connection.js';
import { REALTIME_PATH } from '../realtime/protocol.js';
import type { AnyInclude } from './db.js';

/** Options for `pb.realtime.subscribe()`. */
export type SubscribeOptions<R = Record<string, unknown>> = {
	/** Only changes to records that match, after the change (and before it, for deletes). */
	where?: Where<R> | Filter;
	/** Only these fields of each record. */
	select?: readonly string[];
	/**
	 * Relations to send as records instead of ids, as in `pb.db.<name>.find()`; related records
	 * the view rule of their collection hides are left out (`null`).
	 */
	include?: AnyInclude;
	/** Called when the subscription fails, now or after a reconnect (see `ready`). */
	onError?: (error: PouchbaseError) => void;
};

/**
 * Live changes to records over a WebSocket (`/api/realtime`): every create, update and delete that
 * the collection's view rule lets the caller see. One connection per collection, opened by the
 * first subscription and closed after the last one; it reconnects by itself and follows sign-ins
 * and sign-outs of `pb.authStore`.
 *
 * ```ts
 * const subscription = pb.realtime.subscribe('posts', (event) => {
 * 	console.log(event.action, event.record);
 * });
 * await subscription.ready;
 * subscription.unsubscribe();
 * ```
 *
 * `pb.db.<name>.subscribe()` does the same, typed by the schema.
 */
export class RealtimeService {
	readonly #pb: Pouchbase<object>;
	readonly #webSocket?: WebSocketLike;
	readonly #connections = new Map<string, RealtimeConnection>();
	readonly #listeners = new Set<(collection: string, state: ConnectionState) => void>();

	constructor(pb: Pouchbase<object>, webSocket?: WebSocketLike) {
		this.#pb = pb;
		this.#webSocket = webSocket;

		pb.authStore.onChange(() => {
			for (const connection of this.#connections.values()) {
				connection.tokenChanged();
			}
		});
	}

	/**
	 * Calls `callback` with every change to the records of `topic`: a collection (`'posts'`) or one
	 * record of it (`'posts/<id>'`).
	 */
	subscribe<R = Record<string, unknown>>(
		topic: string,
		callback: (event: RealtimeEvent<R>) => void,
		options: SubscribeOptions<R> = {}
	): RealtimeSubscription {
		const separator = topic.indexOf('/');
		const collection = separator === -1 ? topic : topic.slice(0, separator);
		const record = separator === -1 ? undefined : topic.slice(separator + 1);

		return this.#connection(collection).subscribe(
			{
				record: record || undefined,
				filter: compileWhere(options.where) || undefined,
				fields: compileSelect(options.select)?.split(','),
				expand: compileInclude(options.include)?.split(',')
			},
			callback as (event: RealtimeEvent) => void,
			options.onError
		);
	}

	/**
	 * Calls `listener` when a connection opens, closes or reconnects, e.g. for a "live" indicator.
	 * @returns A function that removes the listener.
	 */
	onState(listener: (collection: string, state: ConnectionState) => void): () => void {
		this.#listeners.add(listener);

		return () => {
			this.#listeners.delete(listener);
		};
	}

	/** Closes every connection and ends every subscription. */
	disconnect(): void {
		for (const connection of this.#connections.values()) {
			connection.close();
		}

		this.#connections.clear();
	}

	#connection(collection: string) {
		let connection = this.#connections.get(collection);

		if (!connection) {
			const url = new URL(this.#pb.buildUrl(REALTIME_PATH, { collection }));

			url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
			connection = new RealtimeConnection({
				url: url.toString(),
				token: () => this.#pb.authStore.token,
				webSocket: this.#webSocket,
				onState: (state) => {
					for (const listener of this.#listeners) {
						listener(collection, state);
					}
				}
			});
			this.#connections.set(collection, connection);
		}

		return connection;
	}
}
