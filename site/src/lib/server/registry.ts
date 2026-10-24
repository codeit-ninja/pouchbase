import type {
	ManifestIssue,
	PluginDetails,
	PluginList,
	PluginSummary,
	PluginVersion
} from '@pouchbasejs/plugin-sdk';
import type { Where } from '@pouchbasejs/js-sdk';

import { isPouchbaseError } from '@pouchbasejs/js-sdk';
import {
	computeIntegrity,
	isSupportedApiVersion,
	parseBundle,
	REGISTRY_API_PREFIX,
	serializeBundle
} from '@pouchbasejs/plugin-sdk';
import semver from 'semver';

import type { PluginRecord, PluginVersionRecord } from './pouchbase';

import { service } from './pouchbase';

/**
 * The plugin registry (API version 1 of `@pouchbasejs/plugin-sdk`, see `registry.ts` there) on top
 * of the Pouchbase collections `plugins` and `plugin_versions`. The routes under `/v1` and the
 * account pages call these functions; failures are thrown as a `RegistryFailure`.
 */

/** A failed registry call, answered as `{ error: { code, message, issues } }` with `status`. */
export class RegistryFailure extends Error {
	override name = 'RegistryFailure';

	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly issues: ManifestIssue[] = []
	) {
		super(message);
	}
}

/** Fields of a version without its bundle, for lists. */
const VERSION_FIELDS = [
	'id',
	'plugin',
	'version',
	'api_version',
	'integrity',
	'size',
	'pouchbase',
	'permissions',
	'created_at'
] as const;

type VersionRow = Pick<PluginVersionRecord, (typeof VERSION_FIELDS)[number]>;

/** URL of the registry API on this site, e.g. `https://api.pouchbase.io/v1`. */
export function registryBase(origin: string) {
	return origin + REGISTRY_API_PREFIX;
}

function bundleUrl(origin: string, slug: string, version: string) {
	return `${registryBase(origin)}/plugins/${slug}/versions/${version}/bundle`;
}

function iso(value: string) {
	return new Date(value).toISOString();
}

function toSummary(plugin: PluginRecord): PluginSummary {
	return {
		id: plugin.slug,
		name: plugin.name,
		description: plugin.description,
		version: plugin.version,
		apiVersion: plugin.api_version,
		author: plugin.author || null,
		iconUrl: plugin.icon_url || null,
		keywords: plugin.keywords,
		downloads: plugin.downloads,
		verified: plugin.verified,
		updatedAt: iso(plugin.updated_at)
	};
}

function toVersion(origin: string, slug: string, row: VersionRow): PluginVersion {
	return {
		version: row.version,
		apiVersion: row.api_version,
		integrity: row.integrity,
		size: row.size,
		bundleUrl: bundleUrl(origin, slug, row.version),
		pouchbase: row.pouchbase || null,
		permissions: { network: row.permissions?.network ?? [] },
		publishedAt: iso(row.created_at)
	};
}

/** API versions as `plugins.api_versions` stores them: `,1,2,`. */
function apiVersionList(versions: number[]) {
	return `,${[...new Set(versions)].sort((a, b) => a - b).join(',')},`;
}

/** Newest first, by semver. */
function bySemver(a: { version: string }, b: { version: string }) {
	return semver.rcompare(a.version, b.version);
}

/** Wraps an unexpected failure of the Pouchbase instance. */
export function backendFailure(error: unknown): never {
	if (error instanceof RegistryFailure) {
		throw error;
	}

	console.error('Plugin registry: the Pouchbase back-end failed', error);

	throw new RegistryFailure(502, 'backend_unavailable', 'The registry could not reach its storage');
}

function findPlugin(slug: string) {
	return service().db.plugins.findFirst({ where: { slug } }).catch(backendFailure);
}

function listVersions(pluginId: string): Promise<VersionRow[]> {
	return service()
		.db.plugin_versions.findAll({ where: { plugin: pluginId }, select: [...VERSION_FIELDS] })
		.then((rows) => rows.sort(bySemver))
		.catch(backendFailure);
}

export type SearchInput = {
	query?: string;
	page: number;
	perPage: number;
	apiVersions: number[];
};

/** Plugins whose name, id or description contains the query, most downloaded first. */
export async function searchPlugins(input: SearchInput): Promise<PluginList> {
	const conditions: Where<PluginRecord>[] = [];

	if (input.query?.trim()) {
		const query = input.query.trim();

		conditions.push({
			$or: [
				{ name: { contains: query } },
				{ slug: { contains: query } },
				{ description: { contains: query } }
			]
		});
	}

	if (input.apiVersions.length) {
		conditions.push({
			$or: input.apiVersions.map((version) => ({ api_versions: { contains: `,${version},` } }))
		});
	}

	const result = await service()
		.db.plugins.findMany({
			where: { $and: conditions },
			orderBy: { downloads: 'desc', name: 'asc' },
			limit: input.perPage,
			page: input.page
		})
		.catch(backendFailure);

	return {
		items: result.items.map(toSummary),
		page: input.page,
		perPage: input.perPage,
		total: result.total
	};
}

/** A plugin with every version, newest first; `null` when there is none. */
export async function getPlugin(origin: string, slug: string): Promise<PluginDetails | null> {
	const plugin = await findPlugin(slug);

	if (!plugin) {
		return null;
	}

	const versions = await listVersions(plugin.id);

	return {
		...toSummary(plugin),
		license: plugin.license,
		homepage: plugin.homepage || null,
		repository: plugin.repository || null,
		readme: plugin.readme || null,
		versions: versions.map((row) => toVersion(origin, slug, row))
	};
}

/**
 * One version of a plugin, or the newest (`latest`) with one of `apiVersions` when given; `null`
 * when the plugin or the version doesn't exist.
 */
export async function getVersion(
	origin: string,
	slug: string,
	version: string,
	apiVersions: number[]
): Promise<PluginVersion | null> {
	const plugin = await findPlugin(slug);

	if (!plugin) {
		return null;
	}

	const versions = (await listVersions(plugin.id)).filter(
		(row) => !apiVersions.length || apiVersions.includes(row.api_version)
	);
	const row =
		version === 'latest' ? versions[0] : versions.find((item) => item.version === version);

	return row ? toVersion(origin, slug, row) : null;
}

/** The bundle of a version, as published; counts a download. `null` when there is none. */
export async function getBundle(slug: string, version: string): Promise<string | null> {
	const plugin = await findPlugin(slug);

	if (!plugin) {
		return null;
	}

	const row = await service()
		.db.plugin_versions.findFirst({
			where: { plugin: plugin.id, version },
			select: ['bundle']
		})
		.catch(backendFailure);

	if (!row) {
		return null;
	}

	// The count is a hint; a failed update shouldn't fail the download.
	await service()
		.db.plugins.patch(plugin.id, { downloads: plugin.downloads + 1 })
		.catch((error: unknown) => console.error('Plugin registry: counting a download failed', error));

	return row.bundle;
}

/** The plugins of a user, newest first, for the account pages. */
export async function listOwnPlugins(userId: string): Promise<PluginRecord[]> {
	return service()
		.db.plugins.findAll({ where: { owner: userId }, orderBy: { created_at: 'desc' } })
		.catch(backendFailure);
}

/**
 * Publishes a bundle as a new version of plugin `slug` for user `userId`. The first version of a
 * plugin makes the user its owner; after that, only the owner can publish. Fails with `422` for an
 * invalid bundle, `403` for someone else's plugin and `409` for a version that exists.
 */
export async function publishVersion(
	origin: string,
	userId: string,
	slug: string,
	bytes: Uint8Array
): Promise<PluginVersion> {
	const parsed = parseBundle(bytes);

	if (!parsed.success) {
		throw new RegistryFailure(422, 'invalid_bundle', 'The bundle is not valid', parsed.issues);
	}

	const { manifest } = parsed.bundle;

	if (manifest.id !== slug) {
		throw new RegistryFailure(422, 'invalid_bundle', `The bundle is for ${manifest.id}`, [
			{ path: 'manifest.id', message: `Must be ${slug}` }
		]);
	}

	if (!isSupportedApiVersion(manifest.apiVersion)) {
		throw new RegistryFailure(
			422,
			'invalid_bundle',
			'The registry does not know this API version',
			[
				{
					path: 'manifest.apiVersion',
					message: `API version ${manifest.apiVersion} is not supported`
				}
			]
		);
	}

	const existing = await findPlugin(slug);

	if (existing && existing.owner !== userId) {
		throw new RegistryFailure(403, 'forbidden', `${slug} belongs to another account`);
	}

	if (existing) {
		const versions = await listVersions(existing.id);

		if (versions.some((row) => row.version === manifest.version)) {
			throw new RegistryFailure(
				409,
				'version_exists',
				`${slug}@${manifest.version} is already published`
			);
		}
	}

	// Stored and served as serialized here, so the integrity matches the bytes hosts download.
	const serialized = serializeBundle(parsed.bundle);
	const bundle = new TextDecoder().decode(serialized);
	const integrity = await computeIntegrity(serialized);
	const metadata = {
		name: manifest.name,
		description: manifest.description,
		author: manifest.author?.name ?? null,
		license: manifest.license,
		homepage: manifest.homepage ?? null,
		repository: manifest.repository ?? null,
		keywords: manifest.keywords,
		version: manifest.version,
		api_version: manifest.apiVersion
	};
	const db = service().db;

	try {
		let plugin = existing;

		if (!plugin) {
			plugin = await db.plugins.insert({
				...metadata,
				slug,
				owner: userId,
				readme: null,
				icon_url: null,
				api_versions: apiVersionList([manifest.apiVersion]),
				downloads: 0,
				verified: false
			});
		} else {
			const apiVersions = apiVersionList([
				...plugin.api_versions.split(',').filter(Boolean).map(Number),
				manifest.apiVersion
			]);
			const newest = semver.gt(manifest.version, plugin.version);

			plugin = await db.plugins.patch(
				plugin.id,
				newest ? { ...metadata, api_versions: apiVersions } : { api_versions: apiVersions }
			);
		}

		const row = await db.plugin_versions.insert(
			{
				plugin: plugin.id,
				version: manifest.version,
				api_version: manifest.apiVersion,
				integrity,
				size: serialized.byteLength,
				pouchbase: manifest.engines.pouchbase ?? null,
				permissions: manifest.permissions,
				bundle
			},
			{ select: [...VERSION_FIELDS] }
		);

		return toVersion(origin, slug, row);
	} catch (error) {
		// Unique indexes on `plugins.slug` and `plugin_versions (plugin, version)` catch a publish
		// that raced this one.
		if (isPouchbaseError(error) && error.status === 409) {
			throw new RegistryFailure(
				409,
				'version_exists',
				`${slug}@${manifest.version} was just published`
			);
		}

		return backendFailure(error);
	}
}
