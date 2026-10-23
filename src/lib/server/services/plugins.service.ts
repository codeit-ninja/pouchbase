import type { ServiceError } from './base.service';
import type {
	ManifestIssue,
	PluginDetails,
	PluginList,
	PluginManifest,
	PluginPermissions
} from '@pouchbasejs/plugin-sdk';
import type { ResultAsync } from 'neverthrow';

import {
	DEFAULT_REGISTRY_URL,
	RegistryError,
	SUPPORTED_API_VERSIONS,
	checkCompatibility,
	createRegistryClient,
	parseBundle
} from '@pouchbasejs/plugin-sdk';
import { asc, eq } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { PLUGIN_REGISTRY_URL } from '$app/env/private';

import { version as POUCHBASE_VERSION } from '../../../../package.json';
import { plugins } from '../db';
import { Service } from './base.service';

/**
 * Plugins from a plugin registry (the public one on pouchbase.io, or `PLUGIN_REGISTRY_URL`). The
 * registry API, the manifest and the bundle format come from `@pouchbasejs/plugin-sdk`. Installing
 * downloads the bundle, checks it against its integrity hash and the manifest rules, and stores it;
 * running what plugins contribute comes later.
 */

/** Results per page when searching the registry. */
const PER_PAGE = 24;

/** An installed plugin as the Plugins page shows it; without the bundle. */
export type InstalledPlugin = {
	id: string;
	name: string;
	version: string;
	apiVersion: number;
	description: string;
	permissions: PluginPermissions;
	contributes: PluginManifest['contributes'];
	registryUrl: string;
	installedAt: Date;
	updatedAt: Date;
};

type RegistryFailed = ServiceError<19000, 'REGISTRY_REQUEST_FAILED'> & {
	data: { status: number; reason: string };
};

type Incompatible = ServiceError<19003, 'PLUGIN_INCOMPATIBLE'> & { data: { reason: string } };

type InvalidBundle = ServiceError<19004, 'INVALID_BUNDLE'> & { data: { issues: ManifestIssue[] } };

function registryUrl() {
	return PLUGIN_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
}

const HOST = { version: POUCHBASE_VERSION, apiVersions: SUPPORTED_API_VERSIONS };

const INSTALLED_COLUMNS = {
	id: plugins.id,
	name: plugins.name,
	version: plugins.version,
	apiVersion: plugins.apiVersion,
	manifest: plugins.manifest,
	registryUrl: plugins.registryUrl,
	installedAt: plugins.installedAt,
	updatedAt: plugins.updatedAt
};

function toInstalled(row: {
	id: string;
	name: string;
	version: string;
	apiVersion: number;
	manifest: PluginManifest;
	registryUrl: string;
	installedAt: Date;
	updatedAt: Date;
}): InstalledPlugin {
	const { manifest, ...rest } = row;

	return {
		...rest,
		description: manifest.description,
		permissions: manifest.permissions,
		contributes: manifest.contributes
	};
}

export class PluginsService extends Service {
	private readonly registry = createRegistryClient({ url: registryUrl() });

	private registryError(error: unknown): RegistryFailed {
		return {
			...this.error(19000, 'REGISTRY_REQUEST_FAILED', error),
			data: {
				status: error instanceof RegistryError ? error.status : 0,
				reason: error instanceof Error ? error.message : String(error)
			}
		};
	}

	/** Plugins in the registry that this Pouchbase can run, matching `query`. */
	search(query: string, page = 1): ResultAsync<PluginList, RegistryFailed> {
		return fromPromise(
			this.registry.search({ query, page, perPage: PER_PAGE, apiVersions: SUPPORTED_API_VERSIONS }),
			(error) => this.registryError(error)
		);
	}

	/** A plugin with its versions and readme; `null` when the registry doesn't have it. */
	details(id: string): ResultAsync<PluginDetails | null, RegistryFailed> {
		return fromPromise(this.registry.get(id), (error) => this.registryError(error));
	}

	installed(): ResultAsync<InstalledPlugin[], ServiceError<19001, 'LIST_PLUGINS_FAILED'>> {
		return fromPromise(
			this.db.select(INSTALLED_COLUMNS).from(plugins).orderBy(asc(plugins.name)),
			(error) => this.error(19001, 'LIST_PLUGINS_FAILED', error)
		).map((rows) => rows.map(toInstalled));
	}

	/**
	 * Installs the newest version of a plugin that this Pouchbase can run (or the `requested` one), or
	 * updates an installed plugin to it.
	 */
	install(
		id: string,
		/** A publish installs the version the development instance has. */
		requested = 'latest'
	): ResultAsync<
		InstalledPlugin,
		| RegistryFailed
		| ServiceError<19002, 'PLUGIN_NOT_FOUND'>
		| Incompatible
		| InvalidBundle
		| ServiceError<19005, 'INSTALL_FAILED'>
	> {
		return fromPromise(this.registry.getVersion(id, requested, SUPPORTED_API_VERSIONS), (error) =>
			this.registryError(error)
		)
			.andThen((version) => {
				if (!version) {
					return errAsync(this.error(19002, 'PLUGIN_NOT_FOUND'));
				}

				const reason = checkCompatibility(
					{
						apiVersion: version.apiVersion,
						engines: { pouchbase: version.pouchbase ?? undefined }
					},
					HOST
				);

				if (reason) {
					return errAsync({ ...this.error(19003, 'PLUGIN_INCOMPATIBLE'), data: { reason } });
				}

				return fromPromise(this.registry.download(version), (error) =>
					this.registryError(error)
				).map((bytes) => ({ version, bytes }));
			})
			.andThen(({ version, bytes }) => {
				const result = parseBundle(bytes);
				const invalid = (issues: ManifestIssue[]): InvalidBundle => ({
					...this.error(19004, 'INVALID_BUNDLE'),
					data: { issues }
				});

				if (!result.success) {
					return errAsync(invalid(result.issues));
				}

				const { manifest } = result.bundle;

				// The registry must serve what it listed; anything else is a broken or hostile registry.
				if (manifest.id !== id || manifest.version !== version.version) {
					return errAsync(
						invalid([
							{
								path: 'manifest',
								message: `Expected ${id}@${version.version}, got ${manifest.id}@${manifest.version}`
							}
						])
					);
				}

				// Checked again on the manifest itself, which may differ from what the registry listed.
				const reason = checkCompatibility(manifest, HOST);

				if (reason) {
					return errAsync({ ...this.error(19003, 'PLUGIN_INCOMPATIBLE'), data: { reason } });
				}

				const now = new Date();
				const values = {
					name: manifest.name,
					version: manifest.version,
					apiVersion: manifest.apiVersion,
					manifest,
					bundle: new TextDecoder().decode(bytes),
					integrity: version.integrity,
					registryUrl: registryUrl(),
					updatedAt: now
				};

				return fromPromise(
					this.db
						.insert(plugins)
						.values({ id, ...values, installedAt: now })
						.onConflictDoUpdate({ target: plugins.id, set: values })
						.returning(INSTALLED_COLUMNS),
					(error) => this.error(19005, 'INSTALL_FAILED', error)
				).map(([row]) => toInstalled(row!));
			});
	}

	/** Removes an installed plugin; `null` when it isn't installed. */
	uninstall(
		id: string
	): ResultAsync<{ id: string } | null, ServiceError<19006, 'UNINSTALL_FAILED'>> {
		return fromPromise(
			this.db.delete(plugins).where(eq(plugins.id, id)).returning({ id: plugins.id }),
			(error) => this.error(19006, 'UNINSTALL_FAILED', error)
		).andThen(([row]) => okAsync(row ?? null));
	}
}
