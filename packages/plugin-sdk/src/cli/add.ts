import type { PluginCategory } from '../categories.js';

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { MAX_CATEGORIES } from '../categories.js';
import {
	MANIFEST_FILE,
	authProviderContributionSchema,
	fieldContributionSchema,
	pageContributionSchema
} from '../manifest.js';
import { ProjectError } from './project.js';
import {
	EXAMPLE_PROVIDER_HOST,
	PROVIDER_ICON,
	authProviderServer,
	fieldFiles,
	json,
	objectKey,
	pageFiles,
	providerIconPath,
	title,
	type Files
} from './templates.js';

/**
 * `pouchbase-plugin add <kind> <id>`: appends a contribution to `pouchbase-plugin.json` and
 * creates the files it points to. It never overwrites a file; the manifest keeps its key order and
 * is written tab-indented.
 */

export const CONTRIBUTION_KINDS = ['field', 'page', 'auth-provider'] as const;

export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export function isContributionKind(value: string): value is ContributionKind {
	return (CONTRIBUTION_KINDS as readonly string[]).includes(value);
}

const KINDS = {
	field: {
		key: 'fields',
		idKey: 'type',
		category: 'fields',
		schema: fieldContributionSchema.shape.type
	},
	page: {
		key: 'pages',
		idKey: 'path',
		category: 'pages',
		schema: pageContributionSchema.shape.path
	},
	'auth-provider': {
		key: 'authProviders',
		idKey: 'id',
		category: 'auth',
		schema: authProviderContributionSchema.shape.id
	}
} as const satisfies Record<
	ContributionKind,
	{
		key: string;
		idKey: string;
		category: PluginCategory;
		schema: { safeParse(value: unknown): { success: boolean } };
	}
>;

/** Where a new plugin puts its server code when `add auth-provider` creates it. */
const DEFAULT_SERVER = 'server/index.ts';

export type AddResult = {
	/** Files created, relative to the plugin. */
	created: string[];
	/** What the author still has to do by hand, e.g. write a handler. */
	hints: string[];
};

type Manifest = Record<string, unknown> & {
	contributes?: Record<string, unknown>;
	categories?: unknown;
	permissions?: { network?: unknown };
	server?: unknown;
};

async function exists(path: string) {
	return access(path).then(
		() => true,
		() => false
	);
}

export async function addContribution(
	root: string,
	kind: ContributionKind,
	id: string
): Promise<AddResult> {
	const { key, idKey, category, schema } = KINDS[kind];

	if (!schema.safeParse(id).success) {
		throw new ProjectError(
			{
				field: `"${id}" can't be a field type; use lowercase letters, numbers and underscores, e.g. rating`,
				page: `"${id}" can't be a page path; use lowercase words separated by dashes and slashes, e.g. reports/monthly`,
				'auth-provider': `"${id}" can't be a provider id; use lowercase words separated by dashes, e.g. gitlab`
			}[kind]
		);
	}

	const manifestPath = join(root, MANIFEST_FILE);
	let manifest: Manifest;

	try {
		const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));

		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error('Not a JSON object');
		}

		manifest = parsed as Manifest;
	} catch (error) {
		throw new ProjectError(`Can't read ${MANIFEST_FILE}: ${(error as Error).message}`);
	}

	const contributes = (manifest.contributes ??= {});

	if (typeof contributes !== 'object' || Array.isArray(contributes)) {
		throw new ProjectError(`contributes in ${MANIFEST_FILE} is not an object`);
	}

	const list = (contributes[key] ??= []);

	if (!Array.isArray(list)) {
		throw new ProjectError(`contributes.${key} in ${MANIFEST_FILE} is not a list`);
	}

	if (list.some((item: unknown) => (item as Record<string, unknown>)?.[idKey] === id)) {
		throw new ProjectError(`contributes.${key} already has ${id}`);
	}

	let files: Files;
	const hints: string[] = [];
	const server = typeof manifest.server === 'string' ? manifest.server : null;

	switch (kind) {
		case 'field': {
			const field = fieldFiles(id);

			list.push(field.contribution);
			files = field.files;

			if (server) {
				hints.push(`add fields.${objectKey(id)} to ${server} to validate or convert its values`);
			}

			break;
		}

		case 'page': {
			const page = pageFiles(id);

			list.push(page.contribution);
			files = page.files;
			break;
		}

		case 'auth-provider': {
			list.push({ id, label: title(id), icon: providerIconPath(id) });
			files = { [providerIconPath(id)]: PROVIDER_ICON };

			if (server) {
				hints.push(
					`add authProviders.${objectKey(id)} to ${server} (e.g. with createOidcProvider) and the provider's hosts to permissions.network`
				);
			} else {
				manifest.server = DEFAULT_SERVER;
				files[DEFAULT_SERVER] = authProviderServer(id);

				const permissions = (manifest.permissions ??= {});
				const network = Array.isArray(permissions.network) ? permissions.network : [];

				if (!network.includes(EXAMPLE_PROVIDER_HOST)) {
					permissions.network = [...network, EXAMPLE_PROVIDER_HOST];
				}

				hints.push(
					`replace the example URLs in ${DEFAULT_SERVER} and ${EXAMPLE_PROVIDER_HOST} in permissions.network with your provider's`
				);
			}

			break;
		}
	}

	// An explicit list of categories replaces the implied ones, so it should name this one too.
	if (Array.isArray(manifest.categories) && !manifest.categories.includes(category)) {
		if (manifest.categories.length < MAX_CATEGORIES) {
			manifest.categories.push(category);
		} else {
			hints.push(`categories is full; consider listing ${category} instead of another category`);
		}
	}

	for (const path of Object.keys(files)) {
		if (await exists(join(root, path))) {
			throw new ProjectError(`${path} already exists`);
		}
	}

	for (const [path, contents] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), contents);
	}

	// New top-level keys such as `server` go before `contributes`, which stays last.
	const rest = Object.entries(manifest).filter(([name]) => name !== 'contributes');

	await writeFile(manifestPath, json({ ...Object.fromEntries(rest), contributes }));

	return { created: Object.keys(files), hints };
}
