/**
 * The network allowlist of a plugin: `ctx.fetch` reaches only the hosts in the manifest's
 * `permissions.network`, over HTTPS. The Worker of an installed plugin has the same rules in its
 * entry code (`worker.ts`); keep both in step.
 *
 * - `api.example.com` matches exactly that host.
 * - `*.example.com` matches every subdomain at any depth (`a.example.com`, `a.b.example.com`), but
 *   not `example.com` itself, the same as a wildcard certificate; list both to allow both.
 */

/** Whether `hostname` (from a URL) is allowed by one entry of `permissions.network`. */
export function hostMatches(hostname: string, pattern: string): boolean {
	const host = hostname.toLowerCase().replace(/\.$/, '');
	const entry = pattern.toLowerCase();

	if (entry.startsWith('*.')) {
		const suffix = entry.slice(1);

		return host.length > suffix.length && host.endsWith(suffix);
	}

	return host === entry;
}

/** Why `url` may not be fetched, or `null` when it may. */
export function blockedReason(url: URL, network: readonly string[]): string | null {
	if (url.protocol !== 'https:') {
		return `Only https URLs can be fetched: ${url.href}`;
	}

	if (!network.some((pattern) => hostMatches(url.hostname, pattern))) {
		return `${url.hostname} is not in permissions.network`;
	}

	return null;
}

/**
 * `fetch` limited to the hosts in `network`. Redirects are not followed: the plugin gets the
 * redirect response and can fetch its `Location` again, which is checked like any other URL.
 */
export function restrictedFetch(
	network: readonly string[],
	upstream: typeof fetch = fetch
): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		const reason = blockedReason(new URL(request.url), network);

		if (reason) {
			throw new TypeError(reason);
		}

		return upstream(new Request(request, { redirect: 'manual' }));
	}) as typeof fetch;
}
