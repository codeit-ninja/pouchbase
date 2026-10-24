import type { ServiceError } from './base.service';
import type { PluginRuntime, ProviderConfig } from '../plugins/runtime';
import type {
	AuthProviderContribution,
	ManifestIssue,
	PluginDetails,
	PluginList,
	PluginManifest,
	PluginPermissions
} from '@pouchbasejs/plugin-sdk';
import type { BatchItem } from 'drizzle-orm/batch';
import type { ResultAsync } from 'neverthrow';

import {
	DEFAULT_REGISTRY_URL,
	RegistryError,
	SERVER_FILE,
	SUPPORTED_API_VERSIONS,
	checkCompatibility,
	createRegistryClient,
	parseBundle
} from '@pouchbasejs/plugin-sdk';
import { asc, eq, inArray } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { PLUGIN_REGISTRY_URL, POUCHBASE_INSTANCE } from '$app/env/private';

import { version as POUCHBASE_VERSION } from '../../../../package.json';
import { generateToken } from '../crypto';
import { pluginAuthProviders, plugins } from '../db';
import { functions as driver, PlatformError } from '../platform';
import { background } from '../platform/runtime';
import {
	describeEmbedded,
	embeddedPlugin,
	embeddedPlugins,
	InProcessRuntime
} from '../plugins/embedded';
import { describePlugin, PluginCallError } from '../plugins/runtime';
import { ENTRY_MODULE, pluginScriptName, WorkerRuntime, workerModules } from '../plugins/worker';
import { Service } from './base.service';

/**
 * Plugins: those installed from a plugin registry (the public one on pouchbase.io, or
 * `PLUGIN_REGISTRY_URL`) and the built-in ones from `plugins/*` (`../plugins/embedded.ts`). The
 * registry API, the manifest and the bundle format come from `@pouchbasejs/plugin-sdk`.
 *
 * Installing downloads the bundle, checks it against its integrity hash and the manifest rules,
 * deploys its server code to a Worker of its own (`../plugins/worker.ts`) and registers the
 * sign-in providers it contributes in `plugin_auth_providers`, with the URLs and scopes the plugin
 * reports. Built-in plugins run inside Pouchbase and register their providers through
 * `ensureEmbedded()`; installing a plugin with the same id from the registry shadows the built-in
 * one. Field types and pages are stored but don't run yet.
 */

/** Results per page when searching the registry. */
const PER_PAGE = 24;

/** How often `describe` is tried right after a deploy, while workers.dev picks up the Worker. */
const DESCRIBE_ATTEMPTS = 5;

/** An installed plugin as the Plugins page shows it; without the bundle. */
export type InstalledPlugin = {
	id: string;
	name: string;
	version: string;
	apiVersion: number;
	description: string;
	permissions: PluginPermissions;
	contributes: PluginManifest['contributes'];
	/** Built in: ships with Pouchbase, runs inside it and can't be removed. */
	embedded: boolean;
	/** Installed from the registry in place of the built-in plugin with this id. */
	replacesBuiltIn: boolean;
	/** `null` for a built-in plugin. */
	registryUrl: string | null;
	installedAt: Date | null;
	updatedAt: Date | null;
};

/** A file of a plugin served to browsers, e.g. a sign-in provider's logo. */
export type PluginAsset = { content: string; contentType: string };

type RegistryFailed = ServiceError<19000, 'REGISTRY_REQUEST_FAILED'> & {
	data: { status: number; reason: string };
};

type ListFailed = ServiceError<19001, 'LIST_PLUGINS_FAILED'>;

type Incompatible = ServiceError<19003, 'PLUGIN_INCOMPATIBLE'> & { data: { reason: string } };

type InvalidBundle = ServiceError<19004, 'INVALID_BUNDLE'> & { data: { issues: ManifestIssue[] } };

type InstallFailed = ServiceError<19005, 'INSTALL_FAILED'>;

type UninstallFailed = ServiceError<19006, 'UNINSTALL_FAILED'>;

type DeployFailed = ServiceError<19007, 'PLUGIN_DEPLOY_FAILED'> & { data: { reason: string } };

type ProviderTaken = ServiceError<19008, 'PROVIDER_ID_TAKEN'> & {
	data: { provider: string; pluginId: string };
};

type CallFailed = ServiceError<19009, 'PLUGIN_CALL_FAILED'> & { data: { reason: string } };

type BuiltIn = ServiceError<19010, 'PLUGIN_BUILT_IN'>;

type NoSubdomain = ServiceError<19011, 'NO_WORKERS_SUBDOMAIN'>;

type SyncFailed = ServiceError<19012, 'SYNC_BUILT_IN_PLUGINS_FAILED'>;

type PluginRow = typeof plugins.$inferSelect;

type ProviderRow = typeof pluginAuthProviders.$inferInsert;

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
		contributes: manifest.contributes,
		embedded: false,
		replacesBuiltIn: embeddedPlugin(row.id) !== null
	};
}

function embeddedToInstalled(manifest: PluginManifest): InstalledPlugin {
	return {
		id: manifest.id,
		name: manifest.name,
		version: manifest.version,
		apiVersion: manifest.apiVersion,
		description: manifest.description,
		permissions: manifest.permissions,
		contributes: manifest.contributes,
		embedded: true,
		replacesBuiltIn: false,
		registryUrl: null,
		installedAt: null,
		updatedAt: null
	};
}

/** The API's messages, e.g. the syntax error a deploy failed with. */
function reason(error: unknown) {
	if (error instanceof PlatformError && error.errors.length) {
		return error.errors.map((item) => item.message).join('; ');
	}

	return error instanceof Error ? error.message : String(error);
}

function providerRow(
	pluginId: string,
	contribution: AuthProviderContribution,
	config: ProviderConfig,
	updatedAt: Date
): ProviderRow {
	return {
		provider: contribution.id,
		pluginId,
		label: contribution.label,
		consoleUrl: contribution.consoleUrl ?? null,
		icon: contribution.icon ?? null,
		authorizeUrl: config.authorizeUrl,
		tokenUrl: config.tokenUrl,
		scopes: config.scopes,
		pkce: config.pkce,
		updatedAt
	};
}

function sameProvider(a: ProviderRow, b: ProviderRow) {
	return (
		a.pluginId === b.pluginId &&
		a.label === b.label &&
		(a.consoleUrl ?? null) === (b.consoleUrl ?? null) &&
		(a.icon ?? null) === (b.icon ?? null) &&
		a.authorizeUrl === b.authorizeUrl &&
		a.tokenUrl === b.tokenUrl &&
		JSON.stringify(a.scopes) === JSON.stringify(b.scopes) &&
		a.pkce === b.pkce
	);
}

/** The config of every provider the manifest contributes, from the plugin's `describe`. */
function providerConfigs(
	manifest: PluginManifest,
	described: Record<string, ProviderConfig>
): { configs: Map<string, ProviderConfig> } | { missing: string } {
	const configs = new Map<string, ProviderConfig>();

	for (const contribution of manifest.contributes.authProviders) {
		const config = described[contribution.id];

		if (!config) {
			return { missing: contribution.id };
		}

		configs.set(contribution.id, config);
	}

	return { configs };
}

/** Logos and other images in `ui/`; the only plugin files served to browsers. */
const ASSET_PATH = /^ui\/(?:[\w-]+\/)*[\w.-]+\.svg$/;

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

	private callFailed(error: unknown): CallFailed {
		return { ...this.error(19009, 'PLUGIN_CALL_FAILED', error), data: { reason: reason(error) } };
	}

	/** Plugins in the registry that this Pouchbase can run, matching `query` (and `category`). */
	search(query: string, page = 1, category?: string): ResultAsync<PluginList, RegistryFailed> {
		return fromPromise(
			this.registry.search({
				query,
				category,
				page,
				perPage: PER_PAGE,
				apiVersions: SUPPORTED_API_VERSIONS
			}),
			(error) => this.registryError(error)
		);
	}

	/** A plugin with its versions and readme; `null` when the registry doesn't have it. */
	details(id: string): ResultAsync<PluginDetails | null, RegistryFailed> {
		return fromPromise(this.registry.get(id), (error) => this.registryError(error));
	}

	/** Installed plugins and the built-in ones they don't shadow, by name. */
	installed(): ResultAsync<InstalledPlugin[], ListFailed> {
		return this.ensureEmbedded()
			.orElse((failure) => {
				console.error('[plugins] Could not register the built-in plugins', failure);

				return okAsync(undefined);
			})
			.andThen(() =>
				fromPromise(
					this.db.select(INSTALLED_COLUMNS).from(plugins).orderBy(asc(plugins.name)),
					(error) => this.error(19001, 'LIST_PLUGINS_FAILED', error)
				)
			)
			.map((rows) => {
				const ids = new Set(rows.map((row) => row.id));

				return [
					...rows.map(toInstalled),
					...embeddedPlugins()
						.filter((plugin) => !ids.has(plugin.manifest.id))
						.map((plugin) => embeddedToInstalled(plugin.manifest))
				].sort((a, b) => a.name.localeCompare(b.name));
			});
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
		| ListFailed
		| ServiceError<19002, 'PLUGIN_NOT_FOUND'>
		| Incompatible
		| InvalidBundle
		| InstallFailed
		| DeployFailed
		| ProviderTaken
		| CallFailed
		| NoSubdomain
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

				const { bundle } = result;
				const { manifest } = bundle;

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

				return okAsync({ version, bytes, manifest, server: bundle.files[SERVER_FILE] ?? null });
			})
			.andThen((input) =>
				this.checkProviderIds(input.manifest)
					.andThen(() => this.findRow(input.manifest.id))
					.map((existing) => ({ ...input, existing }))
			)
			.andThen(({ version, bytes, manifest, server, existing }) =>
				this.runServer(manifest, server, existing).andThen(({ worker, configs }) => {
					const now = new Date();
					const values = {
						name: manifest.name,
						version: manifest.version,
						apiVersion: manifest.apiVersion,
						manifest,
						bundle: new TextDecoder().decode(bytes),
						integrity: version.integrity,
						registryUrl: registryUrl(),
						workerUrl: worker?.url ?? null,
						workerSecret: worker?.secret ?? null,
						updatedAt: now
					};
					const providers = manifest.contributes.authProviders.map((contribution) =>
						providerRow(manifest.id, contribution, configs.get(contribution.id)!, now)
					);

					return fromPromise(
						this.db.batch([
							this.db
								.insert(plugins)
								.values({ id, ...values, installedAt: now })
								.onConflictDoUpdate({ target: plugins.id, set: values })
								.returning(INSTALLED_COLUMNS),
							// Replaces the providers of the previous version, or of the built-in plugin.
							this.db.delete(pluginAuthProviders).where(eq(pluginAuthProviders.pluginId, id)),
							...(providers.length ? [this.db.insert(pluginAuthProviders).values(providers)] : [])
						]),
						(error) => this.error(19005, 'INSTALL_FAILED', error)
					).map(([[row]]) => toInstalled(row!));
				})
			);
	}

	/**
	 * Removes an installed plugin with its Worker and sign-in providers; `null` when it isn't
	 * installed. A built-in plugin can't be removed; removing a plugin that shadowed one brings the
	 * built-in plugin back.
	 */
	uninstall(
		id: string
	): ResultAsync<{ id: string } | null, ListFailed | UninstallFailed | BuiltIn> {
		return this.findRow(id).andThen((row) => {
			if (!row) {
				return embeddedPlugin(id) ? errAsync(this.error(19010, 'PLUGIN_BUILT_IN')) : okAsync(null);
			}

			return fromPromise(
				(async () => {
					if (row.workerUrl) {
						await driver.delete(pluginScriptName(POUCHBASE_INSTANCE, id));
					}

					await this.db.batch([
						this.db.delete(plugins).where(eq(plugins.id, id)),
						this.db.delete(pluginAuthProviders).where(eq(pluginAuthProviders.pluginId, id))
					]);

					return { id };
				})(),
				(error) => this.error(19006, 'UNINSTALL_FAILED', error)
			).andThen((removed) =>
				embeddedPlugin(id)
					? this.ensureEmbedded()
							.orElse((failure) => {
								console.error(`[plugins] Could not bring back the built-in ${id}`, failure);

								return okAsync(undefined);
							})
							.map(() => removed)
					: okAsync(removed)
			);
		});
	}

	/**
	 * Brings `plugin_auth_providers` in line with the built-in plugins of this build: registers the
	 * providers of every built-in plugin that no installed plugin shadows, and removes rows of
	 * plugins that are neither installed nor built in. Writes only when something changed, so it is
	 * cheap to call before reading the providers.
	 */
	ensureEmbedded(): ResultAsync<void, SyncFailed> {
		return fromPromise(
			(async () => {
				const [installedRows, rows] = await this.db.batch([
					this.db.select({ id: plugins.id }).from(plugins),
					this.db.select().from(pluginAuthProviders)
				]);
				const installed = new Set(installedRows.map((row) => row.id));
				const active = embeddedPlugins().filter((plugin) => !installed.has(plugin.manifest.id));
				const activeIds = new Set(active.map((plugin) => plugin.manifest.id));
				const now = new Date();
				const desired: ProviderRow[] = [];

				for (const plugin of active) {
					const description = await describeEmbedded(plugin);

					for (const contribution of plugin.manifest.contributes.authProviders) {
						const config = description.authProviders[contribution.id];
						const holder = rows.find((row) => row.provider === contribution.id);

						if (!config) {
							console.error(
								`[plugins] The built-in ${plugin.manifest.id} has no handler for ${contribution.id}`
							);
							continue;
						}

						// An installed plugin that took the id before this build shipped it keeps it.
						if (
							holder &&
							holder.pluginId !== plugin.manifest.id &&
							installed.has(holder.pluginId)
						) {
							console.warn(
								`[plugins] ${contribution.id} belongs to ${holder.pluginId}; skipping the built-in ${plugin.manifest.id}`
							);
							continue;
						}

						desired.push(providerRow(plugin.manifest.id, contribution, config, now));
					}
				}

				const stale = rows.filter(
					(row) =>
						(!installed.has(row.pluginId) && !activeIds.has(row.pluginId)) ||
						(activeIds.has(row.pluginId) && !desired.some((item) => item.provider === row.provider))
				);
				const changed = desired.filter((item) => {
					const row = rows.find((existing) => existing.provider === item.provider);

					return !row || !sameProvider(row, item);
				});
				const statements: BatchItem<'sqlite'>[] = [
					...(stale.length
						? [
								this.db.delete(pluginAuthProviders).where(
									inArray(
										pluginAuthProviders.provider,
										stale.map((row) => row.provider)
									)
								)
							]
						: []),
					...changed.map((item) =>
						this.db
							.insert(pluginAuthProviders)
							.values(item)
							.onConflictDoUpdate({ target: pluginAuthProviders.provider, set: item })
					)
				];

				if (statements.length) {
					await this.db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
				}
			})(),
			(error) => this.error(19012, 'SYNC_BUILT_IN_PLUGINS_FAILED', error)
		);
	}

	/**
	 * What runs the plugin's server code: its Worker when installed, Pouchbase itself when built in.
	 * `null` when the plugin isn't there or has no server code.
	 */
	runtimeFor(pluginId: string): ResultAsync<PluginRuntime | null, ListFailed> {
		return this.findRow(pluginId).map((row) => {
			if (row) {
				return row.workerUrl && row.workerSecret
					? new WorkerRuntime(row.workerUrl, row.workerSecret)
					: null;
			}

			const plugin = embeddedPlugin(pluginId);

			return plugin?.manifest.server ? new InProcessRuntime(plugin) : null;
		});
	}

	/**
	 * An image of a plugin (`ui/*.svg`), e.g. a sign-in provider's logo; `null` when the plugin or
	 * the file doesn't exist.
	 */
	asset(pluginId: string, path: string): ResultAsync<PluginAsset | null, ListFailed> {
		if (!ASSET_PATH.test(path) || path.split('/').includes('..')) {
			return okAsync(null);
		}

		const asset = (content: string | undefined): PluginAsset | null =>
			typeof content === 'string' ? { content, contentType: 'image/svg+xml' } : null;

		return fromPromise(
			(async () => {
				const [row] = await this.db
					.select({ bundle: plugins.bundle })
					.from(plugins)
					.where(eq(plugins.id, pluginId));

				if (row) {
					const files = (JSON.parse(row.bundle) as { files?: Record<string, string> }).files ?? {};

					return asset(Object.hasOwn(files, path) ? files[path] : undefined);
				}

				const plugin = embeddedPlugin(pluginId);

				return plugin && Object.hasOwn(plugin.assets, path) ? asset(plugin.assets[path]) : null;
			})(),
			(error) => this.error(19001, 'LIST_PLUGINS_FAILED', error)
		);
	}

	private findRow(id: string): ResultAsync<PluginRow | null, ListFailed> {
		return fromPromise(this.db.select().from(plugins).where(eq(plugins.id, id)), (error) =>
			this.error(19001, 'LIST_PLUGINS_FAILED', error)
		).map(([row]) => row ?? null);
	}

	/**
	 * Provider ids are global: one that another plugin (installed, or built in and not shadowed)
	 * contributes can't be taken.
	 */
	private checkProviderIds(
		manifest: PluginManifest
	): ResultAsync<void, ListFailed | ProviderTaken> {
		const ids = manifest.contributes.authProviders.map((provider) => provider.id);

		if (!ids.length) {
			return okAsync(undefined);
		}

		return fromPromise(
			this.db.batch([
				this.db.select({ id: plugins.id }).from(plugins),
				this.db
					.select({
						provider: pluginAuthProviders.provider,
						pluginId: pluginAuthProviders.pluginId
					})
					.from(pluginAuthProviders)
					.where(inArray(pluginAuthProviders.provider, ids))
			]),
			(error) => this.error(19001, 'LIST_PLUGINS_FAILED', error)
		).andThen(([installedRows, rows]) => {
			const installed = new Set(installedRows.map((row) => row.id));
			const holders = [
				...rows,
				...embeddedPlugins()
					.filter((plugin) => !installed.has(plugin.manifest.id))
					.flatMap((plugin) =>
						plugin.manifest.contributes.authProviders.map((provider) => ({
							provider: provider.id,
							pluginId: plugin.manifest.id
						}))
					)
			];
			const taken = holders.find(
				(holder) => ids.includes(holder.provider) && holder.pluginId !== manifest.id
			);

			return taken
				? errAsync({ ...this.error(19008, 'PROVIDER_ID_TAKEN'), data: taken })
				: okAsync(undefined);
		});
	}

	/**
	 * Deploys the server code to the plugin's Worker and asks it what it implements. A plugin
	 * without server code gets no Worker (and loses the one of a previous version).
	 */
	private runServer(
		manifest: PluginManifest,
		server: string | null,
		existing: PluginRow | null
	): ResultAsync<
		{ worker: { url: string; secret: string } | null; configs: Map<string, ProviderConfig> },
		DeployFailed | NoSubdomain | CallFailed
	> {
		const script = pluginScriptName(POUCHBASE_INSTANCE, manifest.id);
		const deployFailed = (error: unknown): DeployFailed => ({
			...this.error(19007, 'PLUGIN_DEPLOY_FAILED', error),
			data: { reason: reason(error) }
		});

		if (!server) {
			if (existing?.workerUrl) {
				this.deleteWorkerLater(script, manifest.id);
			}

			return okAsync({ worker: null, configs: new Map() });
		}

		const secret = existing?.workerSecret ?? generateToken();

		return fromPromise(driver.subdomain(), deployFailed)
			.andThen((subdomain) =>
				subdomain ? okAsync(subdomain) : errAsync(this.error(19011, 'NO_WORKERS_SUBDOMAIN'))
			)
			.andThen((subdomain) =>
				fromPromise(
					(async () => {
						await driver.deploy(script, {
							mainModule: ENTRY_MODULE,
							modules: workerModules(manifest, server),
							bindings: [{ type: 'secret_text', name: 'POUCHBASE_PLUGIN_SECRET', text: secret }],
							message: `${manifest.id}@${manifest.version}`
						});

						if (!existing?.workerUrl) {
							await driver.enableSubdomain(script);
						}

						return { url: `https://${script}.${subdomain}.workers.dev`, secret };
					})(),
					deployFailed
				)
			)
			.andThen((worker) =>
				fromPromise(this.describeWorker(new WorkerRuntime(worker.url, worker.secret)), (error) =>
					this.callFailed(error)
				)
					.andThen((description) => {
						const result = providerConfigs(manifest, description.authProviders);

						if ('missing' in result) {
							return errAsync(
								this.callFailed(
									new PluginCallError(`The server code has no auth provider ${result.missing}`)
								)
							);
						}

						return okAsync({ worker, configs: result.configs });
					})
					.orElse((failure) => {
						// A new Worker that doesn't work is of no use; an updated one keeps its row.
						if (!existing?.workerUrl) {
							this.deleteWorkerLater(script, manifest.id);
						}

						return errAsync(failure);
					})
			);
	}

	private deleteWorkerLater(script: string, pluginId: string) {
		background(
			driver.delete(script).catch((error: unknown) => {
				console.error(`[plugins] Could not delete the Worker of ${pluginId}`, error);
			})
		);
	}

	/** `describe`, tried again while workers.dev doesn't serve a new Worker yet. */
	private async describeWorker(runtime: WorkerRuntime) {
		for (let attempt = 1; ; attempt++) {
			try {
				return await describePlugin(runtime);
			} catch (error) {
				if (
					!(error instanceof PluginCallError) ||
					!error.retryable ||
					attempt >= DESCRIBE_ATTEMPTS
				) {
					throw error;
				}

				await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
			}
		}
	}
}
