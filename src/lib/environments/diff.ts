/**
 * Turns two snapshots into a plan: the steps that make the target look like the source.
 *
 * Collections and fields are matched by id first: objects created by a publish keep their id on
 * the target, so renames are recognised. Objects the target already had (before the instances were
 * linked) are matched by name. Functions are matched by name, plugins by id and OAuth providers by
 * provider. Records, users and secrets are never part of a plan.
 */

import type { SnapshotSettingKey } from './snapshot';
import type {
	Snapshot,
	SnapshotCollection,
	SnapshotField,
	SnapshotFunction,
	SnapshotOAuthProvider,
	SnapshotPlugin
} from '#lib/schemas/environments.js';

import { SNAPSHOT_SETTING_KEYS, stableStringify } from './snapshot';

/**
 * - `safe`: no data is lost.
 * - `risky`: can fail on the data the target has (e.g. a field becomes required).
 * - `destructive`: data or code on the target is removed or converted.
 */
export type Severity = 'safe' | 'risky' | 'destructive';

/** A changed type can't be converted: the field is dropped and created again, without its data. */
export type FieldProperty = 'name' | 'type' | 'required' | 'unique' | 'defaultValue' | 'options';

const FIELD_PROPERTIES: FieldProperty[] = [
	'name',
	'type',
	'required',
	'unique',
	'defaultValue',
	'options'
];

export type FunctionProperty = 'description' | 'requireAuth' | 'code';

type CollectionRef = { collectionId: string; collection: string };

/**
 * A step of a plan. Ids are the target's: an object created by the plan gets the source's id. In
 * the fields of `field.create` and `field.update`, relation options already point at target ids.
 */
export type PlanStep = { severity: Severity } & (
	| {
			kind: 'index.drop';
			collectionId: string;
			collection: string;
			name: string;
			columns: string[];
			unique: boolean;
	  }
	| ({ kind: 'field.delete'; fieldId: string; field: string } & CollectionRef)
	| { kind: 'collection.delete'; collectionId: string; collection: string }
	| { kind: 'collection.rename'; collectionId: string; from: string; to: string }
	| { kind: 'collection.create'; collectionId: string; collection: string }
	| {
			kind: 'collection.settings';
			collectionId: string;
			collection: string;
			settings: SnapshotCollection['settings'];
	  }
	| ({
			kind: 'field.update';
			field: SnapshotField;
			from: string;
			changes: FieldProperty[];
	  } & CollectionRef)
	| ({ kind: 'field.create'; field: SnapshotField } & CollectionRef)
	/** The display order of the fields, as target ids. */
	| ({ kind: 'collection.order'; fieldIds: string[] } & CollectionRef)
	| ({ kind: 'index.create'; columns: string[]; unique: boolean } & CollectionRef)
	| { kind: 'function.delete'; name: string }
	| { kind: 'function.create'; fn: SnapshotFunction }
	| { kind: 'function.update'; fn: SnapshotFunction; changes: FunctionProperty[] }
	| { kind: 'plugin.remove'; id: string; name: string }
	| { kind: 'plugin.install'; plugin: SnapshotPlugin; from: string | null }
	| { kind: 'setting.set'; key: SnapshotSettingKey; from: string | null; to: string }
	| {
			kind: 'oauth.update';
			provider: SnapshotOAuthProvider['provider'];
			/** Missing in plans made before sign-in providers were plugins. */
			label?: string;
			enabled: boolean;
			clientId: string;
	  }
);

export type PlanStepKind = PlanStep['kind'];

/** Something the plan can't do itself, to be done on the target by hand. */
export type PlanWarning =
	| { kind: 'function.secret'; function: string; secret: string }
	| { kind: 'oauth.secret'; provider: string; label?: string }
	/** No plugin on the target contributes the provider, and the plan doesn't install one. */
	| { kind: 'oauth.plugin'; provider: string; label?: string; pluginId?: string }
	| { kind: 'setting.secret'; key: string }
	| { kind: 'plugin.api'; plugin: string; apiVersion: number }
	| { kind: 'collection.system'; collection: string };

export type Plan = {
	steps: PlanStep[];
	warnings: PlanWarning[];
};

/** The order steps run in: removals first, so names they free can be reused by the rest. */
const STEP_ORDER: PlanStepKind[] = [
	'index.drop',
	'field.delete',
	'collection.delete',
	'collection.rename',
	'collection.create',
	'field.update',
	'field.create',
	'collection.order',
	'index.create',
	// After the fields: API rules can refer to fields the plan creates.
	'collection.settings',
	'function.delete',
	'function.create',
	'function.update',
	'plugin.remove',
	'plugin.install',
	'setting.set',
	'oauth.update'
];

function equal(a: unknown, b: unknown) {
	return stableStringify(a) === stableStringify(b);
}

/**
 * Pairs source objects with target objects: by id, then by name for the ones left. Returns the
 * target object for each source id.
 */
export function match<T extends { id: string; name: string }>(source: T[], target: T[]) {
	const pairs = new Map<string, T>();
	const taken = new Set<string>();
	const targetById = new Map(target.map((item) => [item.id, item]));

	for (const item of source) {
		const byId = targetById.get(item.id);

		if (byId) {
			pairs.set(item.id, byId);
			taken.add(byId.id);
		}
	}

	for (const item of source) {
		if (pairs.has(item.id)) {
			continue;
		}

		const byName = target.find(
			(candidate) => candidate.name === item.name && !taken.has(candidate.id)
		);

		if (byName) {
			pairs.set(item.id, byName);
			taken.add(byName.id);
		}
	}

	return { pairs, unmatched: target.filter((item) => !taken.has(item.id)) };
}

/** An index as `unique:col1,col2`; two indexes with the same signature are the same index. */
function indexSignature(index: { columns: string[]; unique: boolean }) {
	return `${index.unique ? 'unique' : 'index'}:${index.columns.join(',')}`;
}

function fieldSeverity(
	changes: FieldProperty[],
	source: SnapshotField,
	target: SnapshotField
): Severity {
	if (changes.includes('type')) {
		return 'destructive';
	}

	if ((source.required && !target.required) || (source.unique && !target.unique)) {
		return 'risky';
	}

	return 'safe';
}

function diffFields(
	source: SnapshotCollection,
	target: SnapshotCollection | null,
	collectionIds: Map<string, string>,
	steps: PlanStep[]
) {
	const ref = { collectionId: target?.id ?? source.id, collection: target?.name ?? source.name };
	// Relation options point at collections by id: translate them to the target's ids.
	const translate = (field: SnapshotField): SnapshotField => {
		const related = field.options.collectionId;

		return related && collectionIds.has(related)
			? { ...field, options: { ...field.options, collectionId: collectionIds.get(related) } }
			: field;
	};

	const { pairs, unmatched } = match(source.fields, target?.fields ?? []);

	for (const field of unmatched) {
		if (!field.system) {
			steps.push({
				kind: 'field.delete',
				severity: 'destructive',
				fieldId: field.id,
				field: field.name,
				...ref
			});
		}
	}

	for (const sourceField of source.fields) {
		const field = translate(sourceField);
		const existing = pairs.get(sourceField.id);

		if (!existing) {
			steps.push({ kind: 'field.create', severity: 'safe', field, ...ref });
			continue;
		}

		const changes = FIELD_PROPERTIES.filter(
			(property) => !equal(field[property], existing[property])
		);

		if (changes.length) {
			steps.push({
				kind: 'field.update',
				severity: fieldSeverity(changes, field, existing),
				field: { ...field, id: existing.id },
				from: existing.name,
				changes,
				...ref
			});
		}
	}

	if (target) {
		diffOrder(source, target, pairs, unmatched, steps, ref);
	}

	return pairs;
}

/**
 * Adds a `collection.order` step when the fields would end up in another order than the source's.
 * New fields, and fields created again for a new type, are added at the end.
 */
function diffOrder(
	source: SnapshotCollection,
	target: SnapshotCollection,
	pairs: Map<string, SnapshotField>,
	unmatched: SnapshotField[],
	steps: PlanStep[],
	ref: CollectionRef
) {
	const targetIds = new Set(target.fields.map((field) => field.id));
	const sourceOrder = source.fields.map((field) => pairs.get(field.id)?.id ?? field.id);
	const recreated = new Set(
		source.fields.flatMap((field) => {
			const existing = pairs.get(field.id);
			return existing && existing.type !== field.type ? [existing.id] : [];
		})
	);
	const deleted = new Set(unmatched.filter((field) => !field.system).map((field) => field.id));
	// Built-in fields the source doesn't have are kept, after the others.
	const kept = unmatched.filter((field) => field.system).map((field) => field.id);
	const wanted = [...sourceOrder, ...kept];

	const result = [
		...target.fields
			.filter((field) => !deleted.has(field.id) && !recreated.has(field.id))
			.map((field) => field.id),
		...sourceOrder.filter((id) => recreated.has(id) || !targetIds.has(id))
	];

	if (!equal(wanted, result)) {
		steps.push({ kind: 'collection.order', severity: 'safe', fieldIds: wanted, ...ref });
	}
}

function diffIndexes(
	source: SnapshotCollection,
	target: SnapshotCollection | null,
	fieldPairs: Map<string, SnapshotField>,
	steps: PlanStep[]
) {
	const ref = { collectionId: target?.id ?? source.id, collection: target?.name ?? source.name };
	// The target's column names as the source calls them, so renamed fields don't count as changes.
	const sourceNames = new Map(
		source.fields.flatMap((field) => {
			const existing = fieldPairs.get(field.id);
			return existing ? [[existing.name, field.name] as const] : [];
		})
	);

	const targetIndexes = (target?.indexes ?? []).map((index) => ({
		index,
		signature: indexSignature({
			unique: index.unique,
			columns: index.columns.map((column) => sourceNames.get(column) ?? `\0${column}`)
		})
	}));

	const sourceSignatures = new Set(source.indexes.map(indexSignature));
	const targetSignatures = new Set(targetIndexes.map(({ signature }) => signature));

	for (const { index, signature } of targetIndexes) {
		if (!sourceSignatures.has(signature)) {
			steps.push({
				kind: 'index.drop',
				severity: 'safe',
				name: index.name,
				columns: index.columns,
				unique: index.unique,
				...ref
			});
		}
	}

	for (const index of source.indexes) {
		if (!targetSignatures.has(indexSignature(index))) {
			steps.push({
				kind: 'index.create',
				// A unique index can't be created while the data has duplicates.
				severity: index.unique ? 'risky' : 'safe',
				columns: index.columns,
				unique: index.unique,
				...ref
			});
		}
	}
}

function diffCollections(
	source: SnapshotCollection[],
	target: SnapshotCollection[],
	steps: PlanStep[],
	warnings: PlanWarning[]
) {
	const { pairs, unmatched } = match(source, target);
	const collectionIds = new Map(
		source.map((collection) => [collection.id, pairs.get(collection.id)?.id ?? collection.id])
	);

	for (const collection of unmatched) {
		if (!collection.system) {
			steps.push({
				kind: 'collection.delete',
				severity: 'destructive',
				collectionId: collection.id,
				collection: collection.name
			});
		}
	}

	for (const collection of source) {
		const existing = pairs.get(collection.id) ?? null;

		if (!existing && collection.system) {
			// Built-in collections are created by the install of every instance.
			warnings.push({ kind: 'collection.system', collection: collection.name });
			continue;
		}

		if (!existing) {
			steps.push({
				kind: 'collection.create',
				severity: 'safe',
				collectionId: collection.id,
				collection: collection.name
			});
		} else if (existing.name !== collection.name) {
			steps.push({
				kind: 'collection.rename',
				severity: 'safe',
				collectionId: existing.id,
				from: existing.name,
				to: collection.name
			});
		}

		if (!equal(collection.settings, existing?.settings ?? {})) {
			steps.push({
				kind: 'collection.settings',
				severity: 'safe',
				collectionId: existing?.id ?? collection.id,
				collection: collection.name,
				settings: collection.settings
			});
		}

		// Steps on fields and indexes use the name the collection has once it is renamed.
		const renamed = existing ? { ...existing, name: collection.name } : null;
		const fieldPairs = diffFields(collection, renamed, collectionIds, steps);

		diffIndexes(collection, renamed, fieldPairs, steps);
	}
}

function diffFunctions(
	source: Snapshot,
	target: Snapshot,
	steps: PlanStep[],
	warnings: PlanWarning[]
) {
	const sourceNames = new Set(source.functions.map((fn) => fn.name));

	for (const fn of target.functions) {
		if (!sourceNames.has(fn.name)) {
			steps.push({ kind: 'function.delete', severity: 'destructive', name: fn.name });
		}
	}

	for (const fn of source.functions) {
		const existing = target.functions.find((candidate) => candidate.name === fn.name);

		if (!existing) {
			steps.push({ kind: 'function.create', severity: 'safe', fn });
		} else {
			const changes: FunctionProperty[] = [];

			if (fn.description !== existing.description) {
				changes.push('description');
			}

			if (fn.requireAuth !== existing.requireAuth) {
				changes.push('requireAuth');
			}

			// Only the source counts: compiled JavaScript follows from it.
			if (
				fn.code &&
				(fn.code.language !== existing.code?.language || fn.code.source !== existing.code?.source)
			) {
				changes.push('code');
			}

			if (changes.length) {
				steps.push({ kind: 'function.update', severity: 'safe', fn, changes });
			}
		}

		for (const secret of fn.secrets) {
			if (!existing?.secrets.includes(secret)) {
				warnings.push({ kind: 'function.secret', function: fn.name, secret });
			}
		}
	}
}

function diffPlugins(
	source: Snapshot,
	target: Snapshot,
	steps: PlanStep[],
	warnings: PlanWarning[]
) {
	const sourceIds = new Set(source.plugins.map((plugin) => plugin.id));

	for (const plugin of target.plugins) {
		if (!sourceIds.has(plugin.id)) {
			steps.push({
				kind: 'plugin.remove',
				severity: 'destructive',
				id: plugin.id,
				name: plugin.name
			});
		}
	}

	for (const plugin of source.plugins) {
		const existing = target.plugins.find((candidate) => candidate.id === plugin.id);

		if (
			existing &&
			existing.version === plugin.version &&
			existing.integrity === plugin.integrity
		) {
			continue;
		}

		if (!target.pluginApiVersions.includes(plugin.apiVersion)) {
			warnings.push({ kind: 'plugin.api', plugin: plugin.id, apiVersion: plugin.apiVersion });
			continue;
		}

		steps.push({
			kind: 'plugin.install',
			severity: 'safe',
			plugin,
			from: existing?.version ?? null
		});
	}
}

function diffSettings(
	source: Snapshot,
	target: Snapshot,
	steps: PlanStep[],
	warnings: PlanWarning[]
) {
	for (const key of SNAPSHOT_SETTING_KEYS) {
		const value = source.settings[key];
		const current = target.settings[key] ?? null;

		// A setting the source never saved keeps the target's value.
		if (value !== undefined && value !== current) {
			steps.push({ kind: 'setting.set', severity: 'safe', key, from: current, to: value });
		}
	}

	if (source.settings.mail_provider === 'smtp' && !target.secrets.smtp_password) {
		warnings.push({ kind: 'setting.secret', key: 'smtp_password' });
	}

	for (const provider of source.oauthProviders) {
		const existing = target.oauthProviders.find(
			(candidate) => candidate.provider === provider.provider
		);
		const label = provider.label ?? existing?.label;

		// Providers come from plugins: one the target doesn't have can only be set up when the plan
		// installs its plugin there.
		if (
			!existing &&
			!steps.some((step) => step.kind === 'plugin.install' && step.plugin.id === provider.pluginId)
		) {
			warnings.push({
				kind: 'oauth.plugin',
				provider: provider.provider,
				...(label ? { label } : {}),
				...(provider.pluginId ? { pluginId: provider.pluginId } : {})
			});
			continue;
		}

		if (
			!existing ||
			existing.enabled !== provider.enabled ||
			existing.clientId !== provider.clientId
		) {
			steps.push({
				kind: 'oauth.update',
				severity: 'safe',
				provider: provider.provider,
				...(label ? { label } : {}),
				enabled: provider.enabled,
				clientId: provider.clientId
			});
		}

		if (provider.enabled && !existing?.hasSecret) {
			warnings.push({
				kind: 'oauth.secret',
				provider: provider.provider,
				...(label ? { label } : {})
			});
		}
	}
}

/** The plan that makes `target` match `source`, with its steps in the order they run. */
export function diff(source: Snapshot, target: Snapshot): Plan {
	const steps: PlanStep[] = [];
	const warnings: PlanWarning[] = [];

	diffCollections(source.collections, target.collections, steps, warnings);
	diffFunctions(source, target, steps, warnings);
	diffPlugins(source, target, steps, warnings);
	diffSettings(source, target, steps, warnings);

	return sorted(steps, warnings);
}

/**
 * The plan that makes the collections of `target` match `source`, for importing collections:
 * only collections, fields, indexes and their settings.
 */
export function diffCollectionsOnly(
	source: SnapshotCollection[],
	target: SnapshotCollection[]
): Plan {
	const steps: PlanStep[] = [];
	const warnings: PlanWarning[] = [];

	diffCollections(source, target, steps, warnings);

	return sorted(steps, warnings);
}

function sorted(steps: PlanStep[], warnings: PlanWarning[]): Plan {
	// A stable sort keeps the order within a kind: fields in the order the source has them.
	steps.sort((a, b) => STEP_ORDER.indexOf(a.kind) - STEP_ORDER.indexOf(b.kind));

	return { steps, warnings };
}

/** The most severe step of a plan; `safe` for an empty plan. */
export function planSeverity(plan: Plan): Severity {
	if (plan.steps.some((step) => step.severity === 'destructive')) {
		return 'destructive';
	}

	return plan.steps.some((step) => step.severity === 'risky') ? 'risky' : 'safe';
}
