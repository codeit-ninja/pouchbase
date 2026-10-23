import semver from 'semver';
import { z } from 'zod';

/**
 * The plugin manifest: `pouchbase-plugin.json` in the root of a plugin. It says what the plugin
 * contributes, so a host can list, check and install it without running any of its code.
 */

/** File name of the manifest in the root of a plugin. */
export const MANIFEST_FILE = 'pouchbase-plugin.json';

/** Directory that holds every UI file of a plugin; the host compiles it on install. */
export const UI_DIR = 'ui';

/** `color-picker`; unique in the registry, and the namespace of everything the plugin adds. */
export const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** `color`, `rich_color`: same rules as the built-in field types. */
const FIELD_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

/** `gitlab`, `my-sso`. */
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** `stats`, `reports/monthly`. */
const PAGE_PATH_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** `api.example.com`, `*.example.com`. */
const HOST_PATTERN = /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** A relative POSIX path inside the plugin, without `..` segments. */
const relativePath = z
	.string()
	.min(1)
	.refine(
		(path) =>
			!path.startsWith('/') &&
			!path.includes('\\') &&
			path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
		// Stops here, so later checks don't repeat the problem.
		{ message: 'Must be a relative path inside the plugin, with forward slashes', abort: true }
	);

/** A Svelte component in the `ui/` directory. */
const componentPath = relativePath.refine(
	(path) => path.startsWith(`${UI_DIR}/`) && path.endsWith('.svelte'),
	`Must be a .svelte file in the ${UI_DIR}/ directory`
);

const label = z.string().trim().min(1).max(64);

const description = z.string().trim().min(1).max(200);

export const fieldContributionSchema = z.object({
	/** Id of the field type, unique within the plugin; the host stores it as `<plugin>:<type>`. */
	type: z.string().regex(FIELD_TYPE_PATTERN, 'Use lowercase letters, numbers and underscores'),
	label,
	description,
	/** SQLite storage class of the column that holds the value. */
	column: z.enum(['TEXT', 'INTEGER', 'REAL', 'BLOB']),
	/** Edits the value in the record form; receives `FieldInputProps`. */
	input: componentPath,
	/** Shows the value in the records grid; receives `FieldCellProps`. Missing shows it as text. */
	cell: componentPath.optional()
});

export const pageContributionSchema = z.object({
	/** Path below the plugin's own pages, e.g. `stats` for `/plugins/<plugin>/stats`. */
	path: z.string().regex(PAGE_PATH_PATTERN, 'Use lowercase words separated by dashes and slashes'),
	title: label,
	/** Receives `PageProps`. */
	component: componentPath,
	/** Whether the page gets a link in the sidebar. */
	navigation: z.boolean().default(true)
});

export const authProviderContributionSchema = z.object({
	/** Id of the provider, unique within the plugin; the host stores it as `<plugin>.<id>`. */
	id: z.string().regex(PROVIDER_ID_PATTERN, 'Use lowercase words separated by dashes'),
	label,
	/** Where an admin registers the OAuth app, shown next to the client id and secret. */
	consoleUrl: z.url().optional()
});

export const permissionsSchema = z.object({
	/**
	 * Hosts the server code may reach with `ctx.fetch`; `*.example.com` also allows its
	 * subdomains. Everything else is blocked.
	 */
	network: z
		.array(z.string().regex(HOST_PATTERN, 'Must be a host name, e.g. api.example.com'))
		.max(20)
		.default([])
});

export const manifestSchema = z
	.object({
		/** The plugin contract this plugin was written against; see `API_VERSION`. */
		apiVersion: z.number().int().positive(),
		id: z
			.string()
			.min(3)
			.max(64)
			.regex(PLUGIN_ID_PATTERN, 'Use lowercase words separated by dashes, e.g. color-picker'),
		name: label,
		/** Exact semantic version of this release, e.g. `1.4.0`. */
		version: z
			.string()
			.refine((value) => semver.valid(value) === value, 'Must be a semver version'),
		description,
		/** SPDX license expression, e.g. `MIT`. */
		license: z.string().trim().min(1).max(64),
		author: z
			.object({
				name: label,
				email: z.email().optional(),
				url: z.url().optional()
			})
			.optional(),
		homepage: z.url().optional(),
		repository: z.url().optional(),
		keywords: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
		engines: z
			.object({
				/** Pouchbase versions the plugin works with, as a semver range, e.g. `>=0.4.0`. */
				pouchbase: z
					.string()
					.refine((value) => semver.validRange(value) !== null, 'Must be a semver range')
			})
			.partial()
			.default({}),
		permissions: permissionsSchema.default({ network: [] }),
		/** Entry of the server code; it default-exports `definePlugin(...)`. */
		server: relativePath
			.refine((path) => /\.(?:ts|js|mjs)$/.test(path), 'Must be a .ts, .js or .mjs file')
			.optional(),
		contributes: z
			.object({
				fields: z.array(fieldContributionSchema).max(20).default([]),
				pages: z.array(pageContributionSchema).max(20).default([]),
				authProviders: z.array(authProviderContributionSchema).max(10).default([])
			})
			.default({ fields: [], pages: [], authProviders: [] })
	})
	.superRefine((manifest, ctx) => {
		const { fields, pages, authProviders } = manifest.contributes;

		for (const [key, ids] of [
			['fields', fields.map((field) => field.type)],
			['pages', pages.map((page) => page.path)],
			['authProviders', authProviders.map((provider) => provider.id)]
		] as const) {
			ids.forEach((id, index) => {
				if (ids.indexOf(id) !== index) {
					ctx.addIssue({
						code: 'custom',
						path: ['contributes', key, index],
						message: `Duplicate id: ${id}`
					});
				}
			});
		}

		// Sign-in runs on the server: the provider's `profile` function maps the user.
		if (authProviders.length && !manifest.server) {
			ctx.addIssue({
				code: 'custom',
				path: ['server'],
				message: 'Auth providers need server code'
			});
		}
	});

/** The manifest as written by the plugin author. */
export type PluginManifestInput = z.input<typeof manifestSchema>;

/** The manifest after validation, with defaults filled in. */
export type PluginManifest = z.output<typeof manifestSchema>;

export type FieldContribution = z.output<typeof fieldContributionSchema>;

export type PageContribution = z.output<typeof pageContributionSchema>;

export type AuthProviderContribution = z.output<typeof authProviderContributionSchema>;

export type PluginPermissions = z.output<typeof permissionsSchema>;

/** A problem with a manifest, e.g. `contributes.fields.0.type: Use lowercase letters, …`. */
export type ManifestIssue = { path: string; message: string };

export type ManifestResult =
	{ success: true; manifest: PluginManifest } | { success: false; issues: ManifestIssue[] };

/** Validates a parsed `pouchbase-plugin.json`. */
export function parseManifest(value: unknown): ManifestResult {
	const result = manifestSchema.safeParse(value);

	if (!result.success) {
		return {
			success: false,
			issues: result.error.issues.map((issue) => ({
				path: issue.path.join('.'),
				message: issue.message
			}))
		};
	}

	return { success: true, manifest: result.data };
}

/** Typed helper for writing a manifest in TypeScript, e.g. in tests. */
export function defineManifest(manifest: PluginManifestInput): PluginManifestInput {
	return manifest;
}

/** Why a host can't install a valid manifest, or `null` when it can. */
export function checkCompatibility(
	manifest: Pick<PluginManifest, 'apiVersion' | 'engines'>,
	host: { version: string; apiVersions: readonly number[] }
): string | null {
	if (!host.apiVersions.includes(manifest.apiVersion)) {
		return manifest.apiVersion > Math.max(...host.apiVersions)
			? `Needs plugin API version ${manifest.apiVersion}; update Pouchbase`
			: `Uses plugin API version ${manifest.apiVersion}, which this Pouchbase no longer supports`;
	}

	const range = manifest.engines.pouchbase;

	if (range && !semver.satisfies(host.version, range, { includePrerelease: true })) {
		return `Needs Pouchbase ${range}; this is ${host.version}`;
	}

	return null;
}
