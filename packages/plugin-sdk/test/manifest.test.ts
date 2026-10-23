import { describe, expect, it } from 'vitest';

import { API_VERSION, checkCompatibility, defineManifest, parseManifest } from '../src/index.js';

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
