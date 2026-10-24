import { describe, expect, it } from 'vitest';

import {
	API_VERSION,
	BUNDLE_FORMAT,
	BUNDLE_VERSION,
	RegistryError,
	computeIntegrity,
	createRegistryClient,
	parseBundle,
	parseManifest,
	serializeBundle,
	type PluginBundle,
	type PluginVersion
} from '../src/index.js';

const manifest = parseManifest({
	apiVersion: API_VERSION,
	id: 'hello',
	name: 'Hello',
	version: '1.0.0',
	description: 'Says hello.',
	license: 'MIT',
	contributes: { pages: [{ path: 'hello', title: 'Hello', component: 'ui/hello.svelte' }] }
});

if (!manifest.success) {
	throw new Error('Test manifest is invalid');
}

const bundle: PluginBundle = {
	format: BUNDLE_FORMAT,
	bundleVersion: BUNDLE_VERSION,
	manifest: manifest.manifest,
	files: { 'ui/hello.svelte': '<p>Hello</p>' }
};

describe('bundles', () => {
	it('round-trips through bytes', () => {
		const result = parseBundle(serializeBundle(bundle));

		expect(result.success && result.bundle.files).toEqual(bundle.files);
	});

	it('rejects missing components and files outside ui/', () => {
		const result = parseBundle(serializeBundle({ ...bundle, files: { 'secrets.txt': 'nope' } }));

		expect(result.success).toBe(false);

		if (!result.success) {
			expect(result.issues.map((issue) => issue.message)).toEqual([
				'File not allowed',
				'Missing file: ui/hello.svelte'
			]);
		}
	});
});

describe('registry client', () => {
	it('downloads a bundle and checks its integrity', async () => {
		const bytes = serializeBundle(bundle);
		const version: PluginVersion = {
			version: '1.0.0',
			apiVersion: 1,
			integrity: await computeIntegrity(bytes),
			size: bytes.byteLength,
			bundleUrl: 'https://registry.test/v1/plugins/hello/versions/1.0.0/bundle',
			pouchbase: null,
			permissions: { network: [] },
			publishedAt: new Date().toISOString()
		};
		const client = createRegistryClient({
			url: 'https://registry.test',
			fetch: async () => new Response(bytes)
		});

		await expect(client.download(version)).resolves.toEqual(bytes);

		const tampered = createRegistryClient({
			url: 'https://registry.test',
			fetch: async () => new Response('{}')
		});

		await expect(tampered.download(version)).rejects.toMatchObject({
			code: 'integrity_mismatch'
		});
	});

	it('returns null for unknown plugins and throws registry errors', async () => {
		const client = createRegistryClient({
			url: 'https://registry.test/',
			fetch: async (input) =>
				String(input).endsWith('/v1/plugins/missing')
					? new Response(null, { status: 404 })
					: Response.json({ error: { code: 'down', message: 'Down' } }, { status: 503 })
		});

		await expect(client.get('missing')).resolves.toBe(null);
		await expect(client.search()).rejects.toBeInstanceOf(RegistryError);
	});

	it('filters by category and defaults missing categories to none', async () => {
		let requested = '';
		const client = createRegistryClient({
			url: 'https://registry.test',
			fetch: async (input) => {
				requested = String(input);

				return Response.json({
					items: [
						{
							id: 'hello',
							name: 'Hello',
							description: 'Says hello.',
							version: '1.0.0',
							apiVersion: 1,
							author: null,
							iconUrl: null,
							keywords: [],
							downloads: 0,
							verified: false,
							updatedAt: new Date().toISOString()
						}
					],
					page: 1,
					perPage: 20,
					total: 1
				});
			}
		});

		const list = await client.search({ query: 'hello', category: 'auth' });

		expect(new URL(requested).searchParams.get('category')).toBe('auth');
		expect(list.items[0]?.categories).toEqual([]);
	});
});
