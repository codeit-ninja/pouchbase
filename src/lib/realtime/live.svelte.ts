import type { ConnectionState } from '@pouchbasejs/js-sdk';

import { Pouchbase } from '@pouchbasejs/js-sdk';

/**
 * Live updates in the dashboard, through the SDK's realtime client. The dashboard connects without
 * a token: the hub sees the session cookie of the same origin, so it is the admin and gets every
 * change, whatever the API rules say.
 */

let client: Pouchbase | null = null;

function pb() {
	client ??= new Pouchbase(location.origin);
	return client;
}

/** How long to wait for more changes before `onChange` runs, so a bulk delete refreshes once. */
const DEBOUNCE_MS = 300;

/**
 * Calls `onChange` after records of the collection were created, updated or deleted, by anyone.
 * Create it during component initialisation; it follows `name` and stops when the component is
 * destroyed. `state` is the state of the connection.
 */
export class LiveCollection {
	state = $state<ConnectionState>('connecting');

	constructor(name: () => string, onChange: () => void) {
		$effect(() => {
			const collection = name();
			let timer: ReturnType<typeof setTimeout> | undefined;
			const realtime = pb().realtime;

			this.state = 'connecting';

			const stopState = realtime.onState((changed, state) => {
				if (changed === collection) {
					this.state = state;
				}
			});
			const subscription = realtime.subscribe(collection, () => {
				clearTimeout(timer);
				timer = setTimeout(onChange, DEBOUNCE_MS);
			});

			subscription.ready.catch(() => {
				this.state = 'closed';
			});

			return () => {
				clearTimeout(timer);
				stopState();
				subscription.unsubscribe();
			};
		});
	}
}
