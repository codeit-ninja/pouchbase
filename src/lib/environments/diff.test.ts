import type { Snapshot, SnapshotCollection, SnapshotField } from '#lib/schemas/environments.js';

import { describe, expect, it } from 'vitest';

import { diff, planSeverity } from './diff';
import { snapshotHash } from './snapshot';

function field(overrides: Partial<SnapshotField> & { id: string; name: string }): SnapshotField {
	return {
		type: 'text',
		required: false,
		unique: false,
		defaultValue: null,
		options: {},
		system: false,
		position: 0,
		...overrides
	};
}

function collection(
	overrides: Partial<SnapshotCollection> & { id: string; name: string }
): SnapshotCollection {
	return { system: false, settings: {}, fields: [], indexes: [], ...overrides };
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
	return {
		format: 1,
		instance: 'pouchbase',
		environment: null,
		createdAt: '2026-10-23T00:00:00.000Z',
		pluginApiVersions: [1],
		collections: [],
		functions: [],
		plugins: [],
		settings: {},
		secrets: {},
		oauthProviders: [],
		...overrides
	};
}

const posts = collection({
	id: 'c-posts',
	name: 'posts',
	fields: [
		field({ id: 'f-id', name: 'id', type: 'id', position: 0 }),
		field({ id: 'f-title', name: 'title', position: 1 })
	]
});

function kinds(source: Snapshot, target: Snapshot) {
	return diff(source, target).steps.map((step) => step.kind);
}

describe('diff', () => {
	it('is empty for equal snapshots', () => {
		const plan = diff(snapshot({ collections: [posts] }), snapshot({ collections: [posts] }));

		expect(plan).toEqual({ steps: [], warnings: [] });
		expect(planSeverity(plan)).toBe('safe');
	});

	it('creates a new collection with its fields and keeps the source ids', () => {
		const plan = diff(snapshot({ collections: [posts] }), snapshot());

		expect(plan.steps.map((step) => step.kind)).toEqual([
			'collection.create',
			'field.create',
			'field.create'
		]);
		expect(plan.steps[0]).toMatchObject({ collectionId: 'c-posts', collection: 'posts' });
		expect(plan.steps[1]).toMatchObject({ collectionId: 'c-posts', field: { id: 'f-id' } });
	});

	it('recognises a renamed collection and field by id', () => {
		const source = collection({
			...posts,
			name: 'articles',
			fields: [posts.fields[0], { ...posts.fields[1], name: 'headline' }]
		});
		const plan = diff(snapshot({ collections: [source] }), snapshot({ collections: [posts] }));

		expect(plan.steps).toEqual([
			{
				kind: 'collection.rename',
				severity: 'safe',
				collectionId: 'c-posts',
				from: 'posts',
				to: 'articles'
			},
			expect.objectContaining({
				kind: 'field.update',
				collection: 'articles',
				from: 'title',
				changes: ['name']
			})
		]);
	});

	it('matches objects the target already had by name and uses their ids', () => {
		const target = collection({
			id: 't-posts',
			name: 'posts',
			fields: [
				field({ id: 't-id', name: 'id', type: 'id', position: 0 }),
				field({ id: 't-title', name: 'title', position: 1, required: false })
			]
		});
		const source = collection({
			...posts,
			fields: [posts.fields[0], { ...posts.fields[1], required: true }]
		});
		const plan = diff(snapshot({ collections: [source] }), snapshot({ collections: [target] }));

		expect(plan.steps).toEqual([
			expect.objectContaining({
				kind: 'field.update',
				severity: 'risky',
				collectionId: 't-posts',
				field: expect.objectContaining({ id: 't-title', required: true }),
				changes: ['required']
			})
		]);
	});

	it('points relation options at the target ids', () => {
		const target = collection({ id: 't-posts', name: 'posts', fields: posts.fields });
		const comments = collection({
			id: 'c-comments',
			name: 'comments',
			fields: [
				field({
					id: 'f-post',
					name: 'post',
					type: 'relation',
					options: { collectionId: 'c-posts' }
				})
			]
		});
		const plan = diff(
			snapshot({ collections: [posts, comments] }),
			snapshot({ collections: [target] })
		);
		const create = plan.steps.find((step) => step.kind === 'field.create');

		expect(create).toMatchObject({ field: { options: { collectionId: 't-posts' } } });
	});

	it('deletes what the source no longer has, but never built-in collections or fields', () => {
		const target = collection({
			...posts,
			fields: [
				...posts.fields,
				field({ id: 'f-body', name: 'body' }),
				field({ id: 'f-sys', name: 'sys', system: true })
			]
		});
		const users = collection({ id: 'c-users', name: 'users', system: true });
		const drafts = collection({ id: 'c-drafts', name: 'drafts' });
		const plan = diff(
			snapshot({ collections: [posts] }),
			snapshot({ collections: [target, users, drafts] })
		);

		expect(plan.steps).toEqual([
			expect.objectContaining({ kind: 'field.delete', field: 'body', severity: 'destructive' }),
			expect.objectContaining({
				kind: 'collection.delete',
				collection: 'drafts',
				severity: 'destructive'
			})
		]);
		expect(planSeverity(plan)).toBe('destructive');
	});

	it('reorders fields with one step instead of position changes', () => {
		const source = collection({ ...posts, fields: [posts.fields[1], posts.fields[0]] });
		const plan = diff(snapshot({ collections: [source] }), snapshot({ collections: [posts] }));

		expect(plan.steps).toEqual([
			{
				kind: 'collection.order',
				severity: 'safe',
				collectionId: 'c-posts',
				collection: 'posts',
				fieldIds: ['f-title', 'f-id']
			}
		]);
	});

	it('moves a field created again for a new type back into place', () => {
		const source = collection({
			...posts,
			fields: [{ ...posts.fields[0], type: 'text' }, posts.fields[1]]
		});

		expect(kinds(snapshot({ collections: [source] }), snapshot({ collections: [posts] }))).toEqual([
			'field.update',
			'collection.order'
		]);
	});

	it('marks a type change as destructive', () => {
		const source = collection({
			...posts,
			fields: [posts.fields[0], { ...posts.fields[1], type: 'integer' }]
		});
		const plan = diff(snapshot({ collections: [source] }), snapshot({ collections: [posts] }));

		expect(plan.steps[0]).toMatchObject({
			kind: 'field.update',
			severity: 'destructive',
			changes: ['type']
		});
	});

	it('orders removals before additions', () => {
		const source = collection({
			...posts,
			fields: [...posts.fields, field({ id: 'f-new', name: 'new', position: 2 })],
			indexes: [{ name: 'ix_a', columns: ['new'], unique: false }]
		});
		const target = collection({
			...posts,
			fields: [...posts.fields, field({ id: 'f-old', name: 'old', position: 2 })],
			indexes: [{ name: 'ix_b', columns: ['old'], unique: false }]
		});

		expect(kinds(snapshot({ collections: [source] }), snapshot({ collections: [target] }))).toEqual(
			['index.drop', 'field.delete', 'field.create', 'index.create']
		);
	});

	it('keeps an index whose column was renamed', () => {
		const source = collection({
			...posts,
			fields: [posts.fields[0], { ...posts.fields[1], name: 'headline' }],
			indexes: [{ name: 'ix_source', columns: ['headline'], unique: true }]
		});
		const target = collection({
			...posts,
			indexes: [{ name: 'ix_target', columns: ['title'], unique: true }]
		});

		expect(kinds(snapshot({ collections: [source] }), snapshot({ collections: [target] }))).toEqual(
			['field.update']
		);
	});

	it('creates, updates and deletes functions by name and warns about missing secrets', () => {
		const code = { language: 'typescript' as const, source: 'a', compiled: 'a' };
		const plan = diff(
			snapshot({
				functions: [
					{ name: 'hello', description: '', requireAuth: false, code, secrets: ['API_KEY'] },
					{
						name: 'sync',
						description: '',
						requireAuth: true,
						code: { ...code, source: 'b' },
						secrets: []
					}
				]
			}),
			snapshot({
				functions: [
					{ name: 'sync', description: '', requireAuth: false, code, secrets: [] },
					{ name: 'old', description: '', requireAuth: false, code, secrets: [] }
				]
			})
		);

		expect(plan.steps).toEqual([
			{ kind: 'function.delete', severity: 'destructive', name: 'old' },
			expect.objectContaining({
				kind: 'function.create',
				fn: expect.objectContaining({ name: 'hello' })
			}),
			expect.objectContaining({ kind: 'function.update', changes: ['requireAuth', 'code'] })
		]);
		expect(plan.warnings).toEqual([
			{ kind: 'function.secret', function: 'hello', secret: 'API_KEY' }
		]);
	});

	it('installs plugins the target can run and warns about the others', () => {
		const plugin = {
			id: 'acme/maps',
			name: 'Maps',
			version: '1.2.0',
			apiVersion: 1,
			integrity: 'sha256-a',
			registryUrl: 'https://registry.pouchbase.io'
		};
		const plan = diff(
			snapshot({ plugins: [plugin, { ...plugin, id: 'acme/next', apiVersion: 2 }] }),
			snapshot({ plugins: [{ ...plugin, version: '1.1.0', integrity: 'sha256-b' }] })
		);

		expect(plan.steps).toEqual([
			{ kind: 'plugin.install', severity: 'safe', plugin, from: '1.1.0' }
		]);
		expect(plan.warnings).toEqual([{ kind: 'plugin.api', plugin: 'acme/next', apiVersion: 2 }]);
	});

	it('copies settings and OAuth client ids, but warns about secrets', () => {
		const plan = diff(
			snapshot({
				settings: { mail_sender_name: 'Shop', mail_provider: 'smtp' },
				oauthProviders: [{ provider: 'github', enabled: true, clientId: 'abc', hasSecret: true }]
			}),
			snapshot({
				settings: { mail_sender_name: 'Shop (dev)' },
				oauthProviders: [{ provider: 'github', enabled: false, clientId: '', hasSecret: false }]
			})
		);

		expect(plan.steps).toEqual([
			{ kind: 'setting.set', severity: 'safe', key: 'mail_provider', from: null, to: 'smtp' },
			{
				kind: 'setting.set',
				severity: 'safe',
				key: 'mail_sender_name',
				from: 'Shop (dev)',
				to: 'Shop'
			},
			{ kind: 'oauth.update', severity: 'safe', provider: 'github', enabled: true, clientId: 'abc' }
		]);
		expect(plan.warnings).toEqual([
			{ kind: 'setting.secret', key: 'smtp_password' },
			{ kind: 'oauth.secret', provider: 'github' }
		]);
	});

	it('carries the provider label of the source', () => {
		const plan = diff(
			snapshot({
				oauthProviders: [
					{
						provider: 'github',
						label: 'GitHub',
						pluginId: 'auth-github',
						enabled: false,
						clientId: 'abc',
						hasSecret: true
					}
				]
			}),
			snapshot({
				oauthProviders: [{ provider: 'github', enabled: false, clientId: '', hasSecret: false }]
			})
		);

		expect(plan.steps).toEqual([
			{
				kind: 'oauth.update',
				severity: 'safe',
				provider: 'github',
				label: 'GitHub',
				enabled: false,
				clientId: 'abc'
			}
		]);
		expect(plan.warnings).toEqual([]);
	});

	it('leaves out providers the target has no plugin for', () => {
		const plan = diff(
			snapshot({
				oauthProviders: [
					{
						provider: 'gitlab',
						label: 'GitLab',
						pluginId: 'auth-gitlab',
						enabled: true,
						clientId: 'abc',
						hasSecret: true
					},
					// From a snapshot made before providers were plugins.
					{ provider: 'okta', enabled: true, clientId: 'def', hasSecret: true }
				]
			}),
			snapshot()
		);

		expect(plan.steps).toEqual([]);
		expect(plan.warnings).toEqual([
			{ kind: 'oauth.plugin', provider: 'gitlab', label: 'GitLab', pluginId: 'auth-gitlab' },
			{ kind: 'oauth.plugin', provider: 'okta' }
		]);
	});

	it('sets up a provider whose plugin the plan installs', () => {
		const plugin = {
			id: 'auth-gitlab',
			name: 'GitLab sign-in',
			version: '1.0.0',
			apiVersion: 1,
			integrity: 'sha256-a',
			registryUrl: 'https://api.pouchbase.io'
		};
		const plan = diff(
			snapshot({
				plugins: [plugin],
				oauthProviders: [
					{
						provider: 'gitlab',
						label: 'GitLab',
						pluginId: 'auth-gitlab',
						enabled: true,
						clientId: 'abc',
						hasSecret: true
					}
				]
			}),
			snapshot()
		);

		expect(plan.steps).toEqual([
			{ kind: 'plugin.install', severity: 'safe', plugin, from: null },
			{
				kind: 'oauth.update',
				severity: 'safe',
				provider: 'gitlab',
				label: 'GitLab',
				enabled: true,
				clientId: 'abc'
			}
		]);
		expect(plan.warnings).toEqual([{ kind: 'oauth.secret', provider: 'gitlab', label: 'GitLab' }]);
	});
});

describe('snapshotHash', () => {
	it('ignores when and where a snapshot was made and the order of keys', async () => {
		const a = snapshot({ settings: { mail_sender_name: 'Shop', mail_provider: 'none' } });
		const b = snapshot({
			instance: 'other',
			createdAt: '2027-01-01T00:00:00.000Z',
			settings: { mail_provider: 'none', mail_sender_name: 'Shop' }
		});

		expect(await snapshotHash(a)).toBe(await snapshotHash(b));
		expect(await snapshotHash(a)).not.toBe(await snapshotHash(snapshot()));
	});
});
