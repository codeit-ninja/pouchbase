import { describe, expect, it } from 'vitest';

import {
	API_VERSION,
	MANIFEST_SCHEMA_URL,
	PLUGIN_CATEGORIES,
	PLUGIN_CATEGORY_LABELS,
	BUNDLE_FORMAT,
	BUNDLE_VERSION,
	checkCompatibility,
	defineManifest,
	effectiveCategories,
	impliedCategories,
	isPluginCategory,
	manifestJsonSchema,
	parseBundle,
	parseManifest,
	serializeBundle,
	serverCodeIssues,
	unknownCategoryIssues,
	withPackageDefaults
} from '../src/index.js';
import { HOST_MODULES, isHostModule } from '../src/ui.js';

const valid = defineManifest({
	apiVersion: API_VERSION,
	id: 'color-picker',
	name: 'Color picker',
	version: '1.0.0',
	description: 'Adds a color field type.',
	license: 'MIT',
	server: 'server/index.ts',
	contributes: {
		fields: [
			{
				type: 'color',
				label: 'Color',
				description: 'A hex color.',
				column: 'TEXT',
				input: 'ui/color-input.svelte'
			}
		]
	}
});

describe('parseManifest', () => {
	it('accepts a valid manifest and fills in defaults', () => {
		const result = parseManifest(valid);

		expect(result.success).toBe(true);

		if (result.success) {
			expect(result.manifest.permissions.network).toEqual([]);
			expect(result.manifest.contributes.pages).toEqual([]);
			expect(result.manifest.engines).toEqual({});
			expect(result.manifest.categories).toEqual([]);
		}
	});

	it('rejects ids, versions and paths that break the rules', () => {
		const result = parseManifest({
			...valid,
			id: 'Color_Picker',
			version: '^1.0.0',
			contributes: {
				fields: [{ ...valid.contributes!.fields![0]!, input: '../escape.svelte' }]
			}
		});

		expect(result.success).toBe(false);

		if (!result.success) {
			expect(result.issues.map((issue) => issue.path)).toEqual([
				'id',
				'version',
				'contributes.fields.0.input'
			]);
		}
	});

	it('rejects duplicate contributions', () => {
		const field = valid.contributes!.fields![0]!;
		const result = parseManifest({ ...valid, contributes: { fields: [field, field] } });

		expect(result.success).toBe(false);
	});

	it('requires server code for auth providers', () => {
		const result = parseManifest({
			...valid,
			server: undefined,
			contributes: { authProviders: [{ id: 'gitlab', label: 'GitLab' }] }
		});

		expect(result.success).toBe(false);

		if (!result.success) {
			expect(result.issues[0]?.path).toBe('server');
		}
	});
});

describe('auth provider icons', () => {
	const withIcon = (icon: string) => ({
		...valid,
		contributes: { authProviders: [{ id: 'gitlab', label: 'GitLab', icon }] }
	});

	it('accepts an SVG in ui/ and rejects other paths', () => {
		expect(parseManifest(withIcon('ui/gitlab.svg')).success).toBe(true);
		expect(parseManifest(withIcon('ui/gitlab.png')).success).toBe(false);
		expect(parseManifest(withIcon('gitlab.svg')).success).toBe(false);
		expect(parseManifest(withIcon('ui/../gitlab.svg')).success).toBe(false);
	});

	it('requires the icon in the bundle and allows SVG files', () => {
		const result = parseManifest({ ...withIcon('ui/gitlab.svg'), server: 'server.js' });

		expect(result.success).toBe(true);

		if (!result.success) {
			return;
		}

		const bundle = (files: Record<string, string>) =>
			parseBundle(
				serializeBundle({
					format: BUNDLE_FORMAT,
					bundleVersion: BUNDLE_VERSION,
					manifest: result.manifest,
					files
				})
			);

		expect(bundle({ 'server.js': '', 'ui/gitlab.svg': '<svg/>' }).success).toBe(true);

		const missing = bundle({ 'server.js': '' });

		expect(missing.success).toBe(false);

		if (!missing.success) {
			expect(missing.issues[0]?.message).toBe('Missing file: ui/gitlab.svg');
		}
	});
});

describe('reserved provider ids', () => {
	it('rejects the ids of the built-in sign-in methods', () => {
		for (const id of ['password', 'email', 'otp']) {
			const result = parseManifest({
				...valid,
				contributes: { authProviders: [{ id, label: 'Mine' }] }
			});

			expect(result.success).toBe(false);
		}
	});
});

describe('serverCodeIssues', () => {
	it('accepts bundled code without imports', () => {
		expect(serverCodeIssues('const a = { imported: 1 }; export { a as default };')).toEqual([]);
		expect(serverCodeIssues('const meta = import.meta.url; export default {};')).toEqual([]);
	});

	it('rejects static, side-effect, re-exported and dynamic imports', () => {
		for (const code of [
			'import { connect } from "cloudflare:sockets";',
			'import{env}from"cloudflare:workers";export default {}',
			'import "cloudflare:sockets";',
			'export * from "node:net";',
			'const m = await import("cloudflare:" + "sockets");'
		]) {
			expect(serverCodeIssues(code)).toHaveLength(1);
		}
	});

	it('makes parseBundle refuse server code with imports', () => {
		const result = parseManifest({ ...valid, server: 'server.js' });

		expect(result.success).toBe(true);

		if (!result.success) {
			return;
		}

		const parsed = parseBundle(
			serializeBundle({
				format: BUNDLE_FORMAT,
				bundleVersion: BUNDLE_VERSION,
				manifest: result.manifest,
				files: {
					'server.js': 'import { connect } from "cloudflare:sockets"; export default {};',
					'ui/color-input.svelte': ''
				}
			})
		);

		expect(parsed.success).toBe(false);
	});
});

describe('HOST_MODULES', () => {
	it('lets UI files import svelte, the prop types and @pouchbasejs/ui', () => {
		expect(HOST_MODULES).toContain('@pouchbasejs/ui');

		for (const specifier of [
			'svelte',
			'svelte/store',
			'@pouchbasejs/plugin-sdk/ui',
			'@pouchbasejs/ui',
			'@pouchbasejs/ui/button',
			'@pouchbasejs/ui/inputs/input'
		]) {
			expect(isHostModule(specifier)).toBe(true);
		}

		for (const specifier of [
			'svelte-ui',
			'svelte/',
			'@pouchbasejs/plugin-sdk',
			'@pouchbasejs/plugin-sdk/server',
			'@pouchbasejs/uix',
			'bits-ui'
		]) {
			expect(isHostModule(specifier)).toBe(false);
		}
	});
});

describe('categories', () => {
	it('accepts unknown categories that match the pattern, so hosts tolerate new ones', () => {
		const result = parseManifest({ ...valid, categories: ['fields', 'future-thing'] });

		expect(result.success && result.manifest.categories).toEqual(['fields', 'future-thing']);
	});

	it('rejects bad patterns, duplicates and more than three categories', () => {
		const bad = parseManifest({ ...valid, categories: ['Fields'] });
		const duplicate = parseManifest({ ...valid, categories: ['fields', 'fields'] });
		const many = parseManifest({
			...valid,
			categories: ['auth', 'fields', 'pages', 'integrations']
		});

		expect(!bad.success && bad.issues.map((issue) => issue.path)).toEqual(['categories.0']);
		expect(!duplicate.success && duplicate.issues.map((issue) => issue.path)).toEqual([
			'categories.1'
		]);
		expect(many.success).toBe(false);
	});

	it('knows the fixed list and its labels', () => {
		expect(isPluginCategory('auth')).toBe(true);
		expect(isPluginCategory('future-thing')).toBe(false);
		expect(Object.keys(PLUGIN_CATEGORY_LABELS)).toEqual([...PLUGIN_CATEGORIES]);
		expect(unknownCategoryIssues(['auth', 'nope']).map((issue) => issue.path)).toEqual([
			'categories.1'
		]);
	});

	it('implies categories from contributions when none are declared', () => {
		const result = parseManifest(valid);

		expect(result.success && effectiveCategories(result.manifest)).toEqual(['fields']);
		expect(
			impliedCategories({
				authProviders: [{ id: 'gitlab', label: 'GitLab' }],
				pages: [{ path: 'a', title: 'A', component: 'ui/a.svelte', navigation: true }]
			})
		).toEqual(['auth', 'pages']);

		const declared = parseManifest({ ...valid, categories: ['integrations'] });

		expect(declared.success && effectiveCategories(declared.manifest)).toEqual(['integrations']);
	});
});

describe('checkCompatibility', () => {
	const host = { version: '0.4.2', apiVersions: [1] };

	it('accepts a supported API version and a matching range', () => {
		expect(checkCompatibility({ apiVersion: 1, engines: { pouchbase: '>=0.4.0' } }, host)).toBe(
			null
		);
	});

	it('explains an API version from the future', () => {
		expect(checkCompatibility({ apiVersion: 2, engines: {} }, host)).toMatch(/update Pouchbase/);
	});

	it('explains a Pouchbase range that does not match', () => {
		expect(checkCompatibility({ apiVersion: 1, engines: { pouchbase: '>=0.5.0' } }, host)).toMatch(
			/Needs Pouchbase >=0.5.0/
		);
	});
});

describe('withPackageDefaults', () => {
	const pkg = {
		name: 'color-picker',
		version: '2.0.0',
		description: 'From package.json.',
		license: 'Apache-2.0',
		author: 'Jane Doe <jane@example.com> (https://example.com)',
		homepage: 'https://example.com/color-picker',
		repository: { type: 'git', url: 'git+https://github.com/jane/color-picker.git' },
		keywords: ['color']
	};

	it('fills what the manifest leaves out', () => {
		const manifest: Record<string, unknown> = { ...valid };

		delete manifest.version;
		delete manifest.license;
		const result = parseManifest(withPackageDefaults(manifest, pkg));

		expect(result.success).toBe(true);

		if (result.success) {
			expect(result.manifest.version).toBe('2.0.0');
			expect(result.manifest.license).toBe('Apache-2.0');
			expect(result.manifest.name).toBe('Color picker');
			expect(result.manifest.description).toBe('Adds a color field type.');
			expect(result.manifest.author).toEqual({
				name: 'Jane Doe',
				email: 'jane@example.com',
				url: 'https://example.com'
			});
			expect(result.manifest.repository).toBe('https://github.com/jane/color-picker');
			expect(result.manifest.keywords).toEqual(['color']);
		}
	});

	it('keeps the manifest values and expands repository shorthands', () => {
		const result = withPackageDefaults(
			{ version: '1.0.0', author: { name: 'Manifest' } },
			{ version: '2.0.0', author: { name: 'Package' }, repository: 'github:jane/color-picker' }
		);

		expect(result).toMatchObject({
			version: '1.0.0',
			author: { name: 'Manifest' },
			repository: 'https://github.com/jane/color-picker'
		});
	});

	it('accepts $schema', () => {
		expect(parseManifest({ ...valid, $schema: MANIFEST_SCHEMA_URL }).success).toBe(true);
	});
});

describe('manifestJsonSchema', () => {
	it('is a draft 2020-12 schema without the package.json fields as required', () => {
		const schema = manifestJsonSchema();

		expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
		expect(schema.$id).toBe(MANIFEST_SCHEMA_URL);
		expect(schema.required).toEqual(['apiVersion', 'id']);
		expect(Object.keys(schema.properties as object)).toContain('$schema');
		expect(
			(schema.properties as { categories: { items: { enum: string[] } } }).categories.items.enum
		).toEqual([...PLUGIN_CATEGORIES]);
	});
});
