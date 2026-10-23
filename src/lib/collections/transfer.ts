/**
 * Exporting and importing collections: a file with their fields, indexes, API rules and settings
 * (`#lib/schemas/collections.js`), without records. An import is a plan like a publish between
 * environments (`#lib/environments/diff.js`), limited to collections: collections in the file are
 * created or changed to match it, matched by id and then by name.
 */

import type { Plan } from '#lib/environments/diff.js';
import type { CollectionExport } from '#lib/schemas/collections.js';
import type { SnapshotCollection } from '#lib/schemas/environments.js';

import { diffCollectionsOnly, match } from '#lib/environments/diff.js';
import { COLLECTION_EXPORT_FORMAT } from '#lib/schemas/collections.js';

/** The export file of `collections`, the ones in `names` only when given (unknown names are left out). */
export function exportCollections(
	collections: SnapshotCollection[],
	names?: string[]
): CollectionExport {
	const exported = names
		? collections.filter((collection) => names.includes(collection.name))
		: collections;
	const ids = new Set(exported.map((collection) => collection.id));
	const related = new Set(
		exported.flatMap((collection) =>
			collection.fields.flatMap((field) =>
				field.type === 'relation' &&
				field.options.collectionId &&
				!ids.has(field.options.collectionId)
					? [field.options.collectionId]
					: []
			)
		)
	);

	return {
		format: COLLECTION_EXPORT_FORMAT,
		exportedAt: new Date().toISOString(),
		collections: exported,
		related: collections
			.filter((collection) => related.has(collection.id))
			.map(({ id, name }) => ({ id, name }))
	};
}

export type ImportOptions = {
	/** Also delete the collections the file doesn't have (built-in collections stay). */
	removeMissing: boolean;
};

/** Why a file can't be imported: a relation points at a collection this instance doesn't have. */
export type ImportProblem = { collection: string; field: string; related: string | null };

/**
 * The plan that imports `file` into an instance with the collections `target`, or the relation
 * fields that point at collections neither the file nor the instance has.
 */
export function planImport(
	file: CollectionExport,
	target: SnapshotCollection[],
	options: ImportOptions
): { plan: Plan } | { problems: ImportProblem[] } {
	const fileIds = new Set(file.collections.map((collection) => collection.id));
	const targetIds = new Set(target.map((collection) => collection.id));
	// Collections outside the file are found by id (the same instance) or else by name.
	const relatedIds = new Map(
		file.related.flatMap((related) => {
			const existing =
				target.find((collection) => collection.id === related.id) ??
				target.find((collection) => collection.name === related.name);

			return existing ? [[related.id, existing.id] as const] : [];
		})
	);
	const relatedNames = new Map(file.related.map((related) => [related.id, related.name]));
	const problems: ImportProblem[] = [];

	const imported = file.collections.map((collection) => ({
		...collection,
		fields: collection.fields.map((field) => {
			// Only built-in collections have built-in fields.
			const system = collection.system && field.system;
			const related = field.type === 'relation' ? field.options.collectionId : undefined;

			if (!related || fileIds.has(related)) {
				return { ...field, system };
			}

			const collectionId = relatedIds.get(related) ?? (targetIds.has(related) ? related : null);

			if (!collectionId) {
				problems.push({
					collection: collection.name,
					field: field.name,
					related: relatedNames.get(related) ?? null
				});
			}

			return {
				...field,
				system,
				options: { ...field.options, collectionId: collectionId ?? related }
			};
		})
	}));

	if (problems.length) {
		return { problems };
	}

	const { unmatched } = match(imported, target);
	const source = options.removeMissing ? imported : [...imported, ...unmatched];

	return { plan: diffCollectionsOnly(source, target) };
}
