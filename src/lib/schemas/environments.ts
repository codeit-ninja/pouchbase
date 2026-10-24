import { z } from 'zod';

import { PROVIDER_ID_PATTERN } from '#lib/auth/oauth-providers.js';
import {
	ENVIRONMENTS,
	SNAPSHOT_FORMAT,
	SNAPSHOT_SECRET_KEYS,
	SNAPSHOT_SETTING_KEYS
} from '#lib/environments/snapshot.js';
import {
	COMPUTED_TRANSFORM_IDS,
	FIELD_TYPE_IDS,
	ID_GENERATOR_IDS,
	RELATION_ON_DELETE_IDS,
	RICH_TEXT_FORMATS
} from '#lib/fields/field-types.js';
import { API_RULE_ACTIONS } from '#lib/filter/rules.js';
import { FUNCTION_LANGUAGES, MAX_CODE_SIZE } from '#lib/functions/functions.js';

/**
 * A snapshot of the schema and configuration of an instance, as one instance sends it to another
 * (see `#lib/environments/snapshot.js`). Only the shape is checked here: the services check the
 * values themselves when a plan is applied.
 */

const id = z.string().min(1).max(64);
const name = z.string().min(1).max(63);

export const fieldOptionsSchema = z
	.object({
		generator: z.enum(ID_GENERATOR_IDS).optional(),
		format: z.enum(RICH_TEXT_FORMATS).optional(),
		collectionId: id.optional(),
		multiple: z.boolean().optional(),
		onDelete: z.enum(RELATION_ON_DELETE_IDS).optional(),
		values: z.array(z.string()).optional(),
		accept: z.array(z.string()).optional(),
		maxSize: z.number().optional(),
		source: z.string().optional(),
		transform: z.enum(COMPUTED_TRANSFORM_IDS).optional(),
		script: z.string().optional(),
		defaultSql: z.boolean().optional()
	})
	.strict();

export const snapshotFieldSchema = z.object({
	id,
	name,
	type: z.enum(FIELD_TYPE_IDS),
	required: z.boolean(),
	unique: z.boolean(),
	defaultValue: z.string().nullable(),
	options: fieldOptionsSchema,
	system: z.boolean(),
	position: z.number().int()
});

export const snapshotIndexSchema = z.object({
	/** The index's name on the instance the snapshot comes from; differs per instance. */
	name: z.string(),
	columns: z.array(z.string()).min(1),
	unique: z.boolean()
});

export const snapshotCollectionSchema = z.object({
	id,
	name,
	system: z.boolean(),
	settings: z.object({
		thumbnails: z.object({ enabled: z.boolean(), sizes: z.array(z.string()) }).optional(),
		rules: z.partialRecord(z.enum(API_RULE_ACTIONS), z.string().nullable()).optional()
	}),
	fields: z.array(snapshotFieldSchema),
	/** Custom indexes only: the indexes of "Unique" fields come with the field. */
	indexes: z.array(snapshotIndexSchema)
});

export const snapshotFunctionSchema = z.object({
	name: z.string().min(1).max(40),
	description: z.string(),
	requireAuth: z.boolean(),
	/** The version that runs; `null` before the first deploy. */
	code: z
		.object({
			language: z.enum(FUNCTION_LANGUAGES),
			source: z.string().max(MAX_CODE_SIZE),
			/** The deployed JavaScript compiled from TypeScript; the server can't compile it itself. */
			compiled: z.string().max(MAX_CODE_SIZE).nullable()
		})
		.nullable(),
	/** Names of the function's secrets; their values never leave the instance. */
	secrets: z.array(z.string())
});

export const snapshotPluginSchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	version: z.string().min(1),
	apiVersion: z.number().int(),
	integrity: z.string(),
	registryUrl: z.string()
});

export const snapshotOAuthProviderSchema = z.object({
	/** The provider id, e.g. `google`. Any id: the provider comes from a plugin. */
	provider: z.string().regex(PROVIDER_ID_PATTERN),
	/** Snapshots before sign-in providers were plugins have neither `label` nor `pluginId`. */
	label: z.string().optional(),
	/** The plugin that contributes the provider. */
	pluginId: z.string().optional(),
	enabled: z.boolean(),
	clientId: z.string(),
	/** Whether a client secret is stored; the secret itself never leaves the instance. */
	hasSecret: z.boolean()
});

export const snapshotSchema = z.object({
	format: z.literal(SNAPSHOT_FORMAT),
	instance: z.string(),
	/** The instance's `environment` setting, `null` when it isn't set. */
	environment: z.string().nullable(),
	createdAt: z.string(),
	/** The plugin API versions the instance can run. */
	pluginApiVersions: z.array(z.number().int()),
	collections: z.array(snapshotCollectionSchema),
	functions: z.array(snapshotFunctionSchema),
	plugins: z.array(snapshotPluginSchema),
	settings: z.partialRecord(z.enum(SNAPSHOT_SETTING_KEYS), z.string()),
	/** Which secret settings are filled in, without their values. */
	secrets: z.partialRecord(z.enum(SNAPSHOT_SECRET_KEYS), z.boolean()),
	oauthProviders: z.array(snapshotOAuthProviderSchema)
});

export type Snapshot = z.infer<typeof snapshotSchema>;
export type SnapshotCollection = z.infer<typeof snapshotCollectionSchema>;
export type SnapshotField = z.infer<typeof snapshotFieldSchema>;
export type SnapshotIndex = z.infer<typeof snapshotIndexSchema>;
export type SnapshotFunction = z.infer<typeof snapshotFunctionSchema>;
export type SnapshotPlugin = z.infer<typeof snapshotPluginSchema>;
export type SnapshotOAuthProvider = z.infer<typeof snapshotOAuthProviderSchema>;

export const deployTokenSchema = z.object({
	name: z.string().trim().min(1, 'Enter a name').max(64, 'Name must be at most 64 characters')
});

/** Whether this instance is for development or production. */
export const environmentSchema = z.object({
	/** `none` when the instance doesn't use environments. */
	environment: z.enum(['none', ...ENVIRONMENTS]).default('none')
});

export const deployTokenIdSchema = z.object({ id: z.string().min(1) });

export const linkRemoteSchema = z.object({
	url: z
		.string()
		.trim()
		.url('Enter the URL of the instance, e.g. https://pouchbase.example.com')
		.refine((url) => /^https?:\/\//.test(url), 'Use an http or https URL'),
	/** Leading underscore: never sent back to the browser. */
	_token: z.string().trim().startsWith('pbdt_', 'Enter a deploy token (it starts with pbdt_)')
});

/**
 * Responses of another instance. Steps and warnings are only checked loosely: they are shown, and
 * the instance that runs them made them itself.
 */
export const remotePlanSchema = z.object({
	plan: z.object({
		steps: z.array(z.looseObject({ kind: z.string(), severity: z.string() })),
		warnings: z.array(z.looseObject({ kind: z.string() }))
	}),
	targetHash: z.string(),
	target: z.object({ environment: z.string().nullable() })
});

export const deploymentSchema = z.object({
	id: z.string(),
	source: z.string(),
	status: z.enum(['running', 'completed', 'failed']),
	done: z.number().int(),
	total: z.number().int(),
	current: z.looseObject({ kind: z.string(), severity: z.string() }).nullable(),
	warnings: z.array(z.looseObject({ kind: z.string() })),
	backingUp: z.boolean(),
	backupId: z.string().nullable(),
	error: z.string().nullable(),
	startedAt: z.coerce.date(),
	finishedAt: z.coerce.date().nullable()
});
