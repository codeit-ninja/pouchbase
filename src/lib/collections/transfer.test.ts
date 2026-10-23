import type { SnapshotCollection, SnapshotField } from '#lib/schemas/environments.js';

import { describe, expect, it } from 'vitest';

import { exportCollections, planImport } from './transfer';

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

const users = collection({
	id: 'c-users',
	name: 'users',
	system: true,
	fields: [field({ id: 'f-email', name: 'email', system: true })]
});

const posts = collection({
	id: 'c-posts',
	name: 'posts',
	fields: [
		field({ id: 'f-title', name: 'title', position: 0 }),
		field({
			id: 'f-author',
			name: 'author',
			type: 'relation',
			options: { collectionId: 'c-users' },
			position: 1
		})
	]
});

const tags = collection({
	id: 'c-tags',
	name: 'tags',
	fields: [field({ id: 'f-label', name: 'label' })]
});

const merge = { removeMissing: false };

describe('exportCollections', () => {
	it('exports every collection without related ones', () => {
		const file = exportCollections([posts, tags, users]);

		expect(file.collections.map((item) => item.name)).toEqual(['posts', 'tags', 'users']);
		expect(file.related).toEqual([]);
	});

	it('names the collections relations point at that are left out', () => {
		const file = exportCollections([posts, tags, users], ['posts']);

		expect(file.collections.map((item) => item.name)).toEqual(['posts']);
		expect(file.related).toEqual([{ id: 'c-users', name: 'users' }]);
	});
});

describe('planImport', () => {
	it('is empty when importing an export into the same instance', () => {
		const file = exportCollections([posts, tags, users]);

		expect(planImport(file, [posts, tags, users], merge)).toEqual({
			plan: { steps: [], warnings: [] }
		});
	});

	it('creates collections on another instance and finds related ones by name', () => {
		const file = exportCollections([posts, users], ['posts']);
		const otherUsers = { ...users, id: 'other-users' };
		const result = planImport(file, [otherUsers], merge);

		if (!('plan' in result)) {
			throw new Error('Expected a plan');
		}

		expect(result.plan.steps.map((step) => step.kind)).toEqual([
			'collection.create',
			'field.create',
			'field.create'
		]);
		expect(result.plan.steps[2]).toMatchObject({
			field: { name: 'author', options: { collectionId: 'other-users' } }
		});
	});

	it('reports relations to collections the instance does not have', () => {
		const file = exportCollections([posts, users], ['posts']);

		expect(planImport(file, [], merge)).toEqual({
			problems: [{ collection: 'posts', field: 'author', related: 'users' }]
		});
	});

	it('keeps collections that are not in the file, unless removeMissing is set', () => {
		const file = exportCollections([posts, users], ['posts', 'users']);
		const kept = planImport(file, [posts, tags, users], merge);
		const removed = planImport(file, [posts, tags, users], { removeMissing: true });

		expect(kept).toEqual({ plan: { steps: [], warnings: [] } });
		expect('plan' in removed && removed.plan.steps).toMatchObject([
			{ kind: 'collection.delete', collection: 'tags', severity: 'destructive' }
		]);
	});

	it('matches existing collections by name and changes them to match the file', () => {
		const changed = collection({
			...posts,
			id: 'elsewhere',
			fields: [
				field({ id: 'other-title', name: 'title', required: true }),
				field({ id: 'f-body', name: 'body', position: 1 })
			]
		});
		const file = exportCollections([changed]);
		const result = planImport(file, [posts, users], merge);

		expect('plan' in result && result.plan.steps.map((step) => step.kind)).toEqual([
			'field.delete',
			'field.update',
			'field.create'
		]);
	});

	it('does not import built-in fields into other collections', () => {
		const file = exportCollections([
			collection({ ...tags, fields: [field({ id: 'f-label', name: 'label', system: true })] })
		]);
		const result = planImport(file, [], merge);

		expect('plan' in result && result.plan.steps[1]).toMatchObject({
			kind: 'field.create',
			field: { system: false }
		});
	});
});
