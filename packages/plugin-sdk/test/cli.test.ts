import type { PluginBundle } from '../src/bundle.js';

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseBundle } from '../src/bundle.js';
import { addContribution } from '../src/cli/add.js';
import { withDevVersion } from '../src/cli/dev-server.js';
import { askTemplate, initProject, parseTemplate } from '../src/cli/init.js';
import { buildBundle, checkServer, loadManifest } from '../src/cli/project.js';
import { TEMPLATES } from '../src/cli/templates.js';
import { parseManifest } from '../src/manifest.js';

const SDK_ROOT = resolve(import.meta.dirname, '..');

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'pouchbase-plugin-'));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

/** A new plugin in `dir`, with this SDK linked in as its dependency so the server code bundles. */
async function project(id: string, template: (typeof TEMPLATES)[number]) {
	const { root } = await initProject(join(dir, id), { template });

	await mkdir(join(root, 'node_modules', '@pouchbasejs'), { recursive: true });
	await symlink(SDK_ROOT, join(root, 'node_modules', '@pouchbasejs', 'plugin-sdk'), 'junction');

	return root;
}

/** `pouchbase-plugin.json` as written, without defaults. */
type ManifestJson = Record<string, unknown> & { contributes: Record<string, unknown[]> };

async function readJson(path: string) {
	return JSON.parse(await readFile(path, 'utf8')) as ManifestJson;
}

describe('init', () => {
	it.each(TEMPLATES)('creates a valid plugin from the %s template', async (template) => {
		const root = await project('auth-acme', template);
		const manifest = await readJson(join(root, 'pouchbase-plugin.json'));
		const { bundle, warnings } = await buildBundle(root);

		expect(manifest.$schema).toBe('https://pouchbase.io/schemas/plugin-manifest.json');
		expect(manifest.version).toBeUndefined();
		expect(manifest.name).toBe(template === 'auth-provider' ? 'Acme sign-in' : 'Auth acme');
		expect(bundle.manifest.version).toBe('0.1.0');
		expect(bundle.manifest.license).toBe('MIT');
		expect(warnings).toEqual([]);
	});

	it('writes the auth-provider template', async () => {
		const root = await project('auth-acme', 'auth-provider');
		const { bundle } = await buildBundle(root);

		expect(bundle.manifest.categories).toEqual(['auth']);
		expect(bundle.manifest.permissions.network).toEqual(['id.example.com']);
		expect(bundle.manifest.contributes.authProviders).toEqual([
			{
				id: 'acme',
				label: 'Acme',
				consoleUrl: 'https://id.example.com/apps',
				icon: 'ui/acme.svg'
			}
		]);
		expect(bundle.files['ui/acme.svg']).toContain('<svg');
	});

	it('writes the page template with a route', async () => {
		const root = await project('hello-page', 'page');
		const { bundle } = await buildBundle(root);

		expect(bundle.manifest.categories).toEqual(['pages']);
		expect(bundle.manifest.contributes.pages[0]?.component).toBe('ui/hello-page.svelte');
		expect(bundle.files['server.js']).toContain('GET /hello');
		expect(bundle.files['ui/hello-page.svelte']).toContain("from '@pouchbasejs/ui/button'");
	});

	it('refuses a directory that is not empty or not a plugin id', async () => {
		await writeFile(join(dir, 'file.txt'), '');
		await expect(initProject(join(dir, 'Not_An_Id'))).rejects.toThrow("can't be a plugin id");
		await mkdir(join(dir, 'taken'));
		await writeFile(join(dir, 'taken', 'file.txt'), '');
		await expect(initProject(join(dir, 'taken'))).rejects.toThrow('is not empty');
	});

	it('parses --template and does not prompt without a terminal', async () => {
		expect(parseTemplate('page')).toBe('page');
		expect(() => parseTemplate('nope')).toThrow('Unknown template: nope');
		await expect(askTemplate(new PassThrough(), new PassThrough())).resolves.toBe('field');
	});
});

describe('add', () => {
	it('appends a field and creates its components', async () => {
		const root = await project('my-plugin', 'empty');
		const before = await readFile(join(root, 'pouchbase-plugin.json'), 'utf8');
		const result = await addContribution(root, 'field', 'rich_color');
		const text = await readFile(join(root, 'pouchbase-plugin.json'), 'utf8');
		const manifest = await readJson(join(root, 'pouchbase-plugin.json'));

		expect(before).toContain('\t"apiVersion"');
		expect(text).toContain('\t"apiVersion"');
		expect(text.endsWith('}\n')).toBe(true);
		expect(result.created).toEqual(['ui/rich-color-input.svelte', 'ui/rich-color-cell.svelte']);
		expect(manifest.contributes.fields).toEqual([
			{
				type: 'rich_color',
				label: 'Rich color',
				description: 'A rich color value.',
				column: 'TEXT',
				input: 'ui/rich-color-input.svelte',
				cell: 'ui/rich-color-cell.svelte'
			}
		]);
		await expect(buildBundle(root)).resolves.toBeDefined();
	});

	it('adds a page and its category to an explicit list', async () => {
		const root = await project('my-plugin', 'field');

		await addContribution(root, 'page', 'reports/monthly');

		const manifest = await loadManifest(root);

		expect(manifest.categories).toEqual(['fields', 'pages']);
		expect(manifest.contributes.pages).toEqual([
			{
				path: 'reports/monthly',
				title: 'Monthly',
				component: 'ui/reports-monthly-page.svelte',
				navigation: true
			}
		]);
		await expect(buildBundle(root)).resolves.toBeDefined();
	});

	it('adds an auth provider with server code when there is none', async () => {
		const root = await project('my-plugin', 'empty');
		const result = await addContribution(root, 'auth-provider', 'my-sso');
		const manifest = await readJson(join(root, 'pouchbase-plugin.json'));

		expect(result.created).toEqual(['ui/my-sso.svg', 'server/index.ts']);
		expect(manifest.server).toBe('server/index.ts');
		expect(manifest.permissions).toEqual({ network: ['id.example.com'] });
		expect(Object.keys(manifest).at(-1)).toBe('contributes');
		await expect(buildBundle(root)).resolves.toBeDefined();
	});

	it('only hints at the handler when the plugin has server code', async () => {
		const root = await project('my-plugin', 'field');
		const result = await addContribution(root, 'auth-provider', 'gitlab');

		expect(result.created).toEqual(['ui/gitlab.svg']);
		expect(result.hints[0]).toContain('authProviders.gitlab');
		await expect(buildBundle(root)).rejects.toThrow('The server code does not match the manifest');
	});

	it('refuses invalid ids, duplicates and existing files', async () => {
		const root = await project('my-plugin', 'field');

		await expect(addContribution(root, 'field', 'Bad Type')).rejects.toThrow(
			"can't be a field type"
		);
		await expect(addContribution(root, 'field', 'color')).rejects.toThrow('already has color');
		await writeFile(join(root, 'ui', 'stats-page.svelte'), '');
		await expect(addContribution(root, 'page', 'stats')).rejects.toThrow('already exists');

		const manifest = await loadManifest(root);

		expect(manifest.contributes.pages).toEqual([]);
	});
});

describe('checkServer', () => {
	const manifest = (contributes: Record<string, unknown>) => {
		const result = parseManifest({
			apiVersion: 1,
			id: 'my-plugin',
			name: 'My plugin',
			version: '1.0.0',
			description: 'A plugin.',
			license: 'MIT',
			server: 'server/index.ts',
			contributes
		});

		if (!result.success) {
			throw new Error(JSON.stringify(result.issues));
		}

		return result.manifest;
	};

	it('finds missing, incomplete and unknown handlers', async () => {
		const { issues } = await checkServer(
			manifest({
				authProviders: [
					{ id: 'acme', label: 'Acme' },
					{ id: 'other', label: 'Other' }
				]
			}),
			`export default {
				authProviders: { acme: { authorizeUrl: 'x', tokenUrl: 'y', scopes: [] } },
				fields: { color: {} },
				routes: { 'stats': () => new Response(), 'GET /ok': () => new Response() }
			};`
		);

		expect(issues).toEqual([
			{
				path: 'contributes.authProviders.0',
				message: 'The handler in server/index.ts lacks pkce, profile'
			},
			{
				path: 'contributes.authProviders.1',
				message: 'No handler: add authProviders.other to server/index.ts'
			},
			{
				path: 'server/index.ts',
				message: 'fields.color has no contribution in contributes.fields of pouchbase-plugin.json'
			},
			{
				path: 'server/index.ts',
				message: 'routes["stats"]: use a method and a path, e.g. "GET /stats"'
			}
		]);
	});

	it('asks for a default export and warns when the code does not load', async () => {
		await expect(checkServer(manifest({}), 'export const x = 1;')).resolves.toEqual({
			issues: [{ path: 'server/index.ts', message: 'Must default-export definePlugin({ ... })' }],
			warnings: []
		});

		const { issues, warnings } = await checkServer(manifest({}), 'throw new Error("boom");');

		expect(issues).toEqual([]);
		expect(warnings[0]?.message).toContain('boom');
	});
});

describe('withDevVersion', () => {
	it('serves every build as a new prerelease', () => {
		const bundle = {
			format: 'pouchbase-plugin-bundle',
			bundleVersion: 1,
			manifest: manifestFor('1.2.0'),
			files: {}
		} satisfies PluginBundle;
		const first = withDevVersion(bundle, 1);
		const second = withDevVersion(bundle, 2);
		const parsed = parseBundle(second.bytes);

		expect(first.bundle.manifest.version).toBe('1.2.0-dev.1');
		expect(parsed.success && parsed.bundle.manifest.version).toBe('1.2.0-dev.2');
		expect(bundle.manifest.version).toBe('1.2.0');
		expect(
			withDevVersion({ ...bundle, manifest: manifestFor('1.0.0-beta.1') }, 3).bundle.manifest
				.version
		).toBe('1.0.0-beta.1-dev.3');
	});
});

function manifestFor(version: string) {
	const result = parseManifest({
		apiVersion: 1,
		id: 'my-plugin',
		name: 'My plugin',
		version,
		description: 'A plugin.',
		license: 'MIT'
	});

	if (!result.success) {
		throw new Error(JSON.stringify(result.issues));
	}

	return result.manifest;
}
