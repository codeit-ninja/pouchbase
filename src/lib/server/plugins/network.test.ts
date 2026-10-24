import { describe, expect, it } from 'vitest';

import { hostMatches, restrictedFetch } from './network';

describe('hostMatches', () => {
	it('matches an exact host only', () => {
		expect(hostMatches('api.example.com', 'api.example.com')).toBe(true);
		expect(hostMatches('API.Example.com', 'api.example.com')).toBe(true);
		expect(hostMatches('api.example.com.', 'api.example.com')).toBe(true);
		expect(hostMatches('example.com', 'api.example.com')).toBe(false);
		expect(hostMatches('x.api.example.com', 'api.example.com')).toBe(false);
		expect(hostMatches('api.example.com.evil.com', 'api.example.com')).toBe(false);
	});

	it('matches subdomains of a wildcard, not the apex', () => {
		expect(hostMatches('a.example.com', '*.example.com')).toBe(true);
		expect(hostMatches('a.b.example.com', '*.example.com')).toBe(true);
		expect(hostMatches('example.com', '*.example.com')).toBe(false);
		expect(hostMatches('badexample.com', '*.example.com')).toBe(false);
		expect(hostMatches('example.com.evil.com', '*.example.com')).toBe(false);
	});
});

describe('restrictedFetch', () => {
	function upstream() {
		const requests: Request[] = [];
		const fetch = (async (input: RequestInfo | URL) => {
			requests.push(input as Request);

			return new Response('ok');
		}) as typeof globalThis.fetch;

		return { fetch, requests };
	}

	it('passes allowed requests on without following redirects', async () => {
		const { fetch, requests } = upstream();
		const limited = restrictedFetch(['api.example.com', '*.cdn.example.com'], fetch);

		await limited('https://api.example.com/user', { headers: { authorization: 'Bearer x' } });
		await limited(new Request('https://img.cdn.example.com/a.png'));

		expect(requests.map((request) => request.url)).toEqual([
			'https://api.example.com/user',
			'https://img.cdn.example.com/a.png'
		]);
		expect(requests[0]!.headers.get('authorization')).toBe('Bearer x');
		expect(requests[0]!.redirect).toBe('manual');
	});

	it('rejects other hosts and plain http', async () => {
		const { fetch, requests } = upstream();
		const limited = restrictedFetch(['api.example.com'], fetch);

		await expect(limited('https://evil.com/')).rejects.toThrow(
			'evil.com is not in permissions.network'
		);
		await expect(limited('http://api.example.com/')).rejects.toThrow('Only https URLs');
		await expect(limited(new URL('https://cdn.example.com/'))).rejects.toThrow(TypeError);
		expect(requests).toHaveLength(0);
	});
});
