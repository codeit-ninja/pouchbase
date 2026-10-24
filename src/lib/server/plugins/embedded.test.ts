import { describe, expect, it } from 'vitest';

import { embeddedPlugin, embeddedPlugins, InProcessRuntime, loadEmbeddedPlugins } from './embedded';
import { describePlugin, oauthProfileSchema } from './runtime';

describe('embeddedPlugins', () => {
	it('finds the first-party plugins in plugins/', () => {
		const ids = embeddedPlugins().map((plugin) => plugin.manifest.id);

		expect(ids).toEqual(
			expect.arrayContaining([
				'auth-discord',
				'auth-github',
				'auth-google',
				'auth-microsoft',
				'auth-twitch'
			])
		);
	});

	it('fills the manifest from package.json and bundles the icons', () => {
		const google = embeddedPlugin('auth-google')!;

		expect(google.manifest.version).toMatch(/^\d+\.\d+\.\d+/);
		expect(google.manifest.license).toBe('MIT');
		expect(google.manifest.contributes.authProviders[0]).toMatchObject({ id: 'google' });
		expect(google.assets['ui/google.svg']).toContain('<svg');
	});

	it('runs the server code in process', async () => {
		const requests: string[] = [];
		const runtime = new InProcessRuntime(embeddedPlugin('auth-google')!, {
			fetch: (async (input: RequestInfo | URL) => {
				const request = input as Request;

				requests.push(`${request.url} ${request.headers.get('authorization')}`);

				return Response.json({
					sub: '123',
					email: 'ada@example.com',
					email_verified: true,
					name: 'Ada'
				});
			}) as typeof fetch
		});

		const description = await describePlugin(runtime);

		expect(description.authProviders.google).toMatchObject({
			authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			pkce: true
		});

		const profile = oauthProfileSchema.parse(
			await runtime.call({
				type: 'profile',
				provider: 'google',
				accessToken: 'token',
				credentials: { clientId: 'client' }
			})
		);

		expect(profile).toEqual({
			id: '123',
			email: 'ada@example.com',
			emailVerified: true,
			name: 'Ada',
			avatarUrl: null
		});
		expect(requests).toEqual(['https://openidconnect.googleapis.com/v1/userinfo Bearer token']);
	});

	it('every built-in plugin describes the providers it contributes', async () => {
		for (const plugin of embeddedPlugins()) {
			const description = await describePlugin(new InProcessRuntime(plugin));

			expect(Object.keys(description.authProviders).sort()).toEqual(
				plugin.manifest.contributes.authProviders.map((provider) => provider.id).sort()
			);
		}
	});
});

describe('loadEmbeddedPlugins', () => {
	const manifest = {
		apiVersion: 1,
		id: 'auth-example',
		name: 'Example sign-in',
		server: 'server/index.ts',
		contributes: { authProviders: [{ id: 'example', label: 'Example', icon: 'ui/example.svg' }] }
	};
	const pkg = { version: '1.0.0', description: 'Sign in with Example.', license: 'MIT' };

	it('skips plugins with an invalid manifest, missing server code or missing icons', () => {
		const { plugins, issues } = loadEmbeddedPlugins({
			manifests: {
				'/plugins/a/pouchbase-plugin.json': manifest,
				'/plugins/b/pouchbase-plugin.json': { ...manifest, id: 'auth-b' },
				'/plugins/c/pouchbase-plugin.json': { ...manifest, id: 'auth-c' },
				'/plugins/d/pouchbase-plugin.json': { id: 'Bad' }
			},
			packages: {
				'/plugins/a/package.json': pkg,
				'/plugins/b/package.json': pkg,
				'/plugins/c/package.json': pkg
			},
			servers: {
				'/plugins/a/server/index.ts': async () => ({ default: {} }),
				'/plugins/c/server/index.ts': async () => ({ default: {} })
			},
			assets: { '/plugins/a/ui/example.svg': '<svg/>' }
		});

		expect(plugins.map((plugin) => plugin.manifest.id)).toEqual(['auth-example']);
		expect(plugins[0]!.assets).toEqual({ 'ui/example.svg': '<svg/>' });
		expect(issues).toEqual([
			{ dir: '/plugins/b', message: 'Missing server code: server/index.ts' },
			{ dir: '/plugins/c', message: 'Missing file: ui/example.svg' },
			{ dir: '/plugins/d', message: expect.stringMatching(/^Invalid manifest/) }
		]);
	});
});
