import type { PluginContext } from '@pouchbasejs/plugin-sdk/server';

/**
 * Test helpers for the plugins in this directory: a `PluginContext` whose `fetch` answers from
 * canned responses and, like the host, only reaches the hosts in `permissions.network`.
 */

export type FakeRequest = { url: string; headers: Headers };

/** A canned answer: a JSON body (status 200) or a full `Response`. */
export type FakeResponse = unknown;

export function fakeContext(
	manifest: { id: string; permissions: { network: string[] } },
	responses: Record<string, FakeResponse>
) {
	const requests: FakeRequest[] = [];
	const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : input);

		if (!manifest.permissions.network.includes(url.hostname)) {
			throw new Error(`${url.hostname} is not in permissions.network`);
		}

		requests.push({ url: url.href, headers: new Headers(init?.headers) });

		const response = responses[url.href];

		if (response === undefined) {
			return new Response('Not found', { status: 404 });
		}

		return response instanceof Response ? response : Response.json(response);
	}) as typeof globalThis.fetch;
	const ctx: PluginContext = {
		plugin: { id: manifest.id, version: '1.0.0' },
		fetch,
		settings: { get: async () => null },
		log: { info() {}, warn() {}, error() {} }
	};

	return { ctx, requests };
}

/** The headers every profile request sends, as `fetchJson` sets them. */
export function expectedHeaders(accessToken: string) {
	return {
		authorization: `Bearer ${accessToken}`,
		accept: 'application/json',
		'user-agent': 'Pouchbase'
	};
}
