import { z } from 'zod';

import { verifyIntegrity } from './bundle.js';
import { PLUGIN_ID_PATTERN, permissionsSchema } from './manifest.js';

/**
 * The plugin registry API (version 1): how the dashboard searches and downloads plugins, and how
 * `pouchbase-plugin publish` uploads them. Any server that implements these endpoints can act as
 * a registry; `pouchbase-plugin dev` runs a local one.
 *
 * | Method | Path                                         | Response                         |
 * | ------ | -------------------------------------------- | -------------------------------- |
 * | GET    | `/v1/plugins?q=&page=&perPage=&apiVersion=`  | `PluginList`                     |
 * | GET    | `/v1/plugins/:id`                            | `PluginDetails`, 404             |
 * | GET    | `/v1/plugins/:id/versions/:version`          | `PluginVersion`, 404             |
 * | GET    | `PluginVersion.bundleUrl`                    | the bundle (`application/json`)  |
 * | POST   | `/v1/plugins/:id/versions` (bundle as body)  | 201 `PluginVersion`, 401, 409, 422 |
 *
 * `:version` is a semver version or `latest`; with `?apiVersion=` (repeatable), `latest` is the
 * newest version with one of those API versions. Errors have a `RegistryErrorBody`. Publishing
 * needs `Authorization: Bearer <token>`.
 */

export const REGISTRY_API_PREFIX = '/v1';

/** The public registry on pouchbase.io (`/v1` on the API host is served by the website). */
export const DEFAULT_REGISTRY_URL = 'https://api.pouchbase.io';

const pluginId = z.string().regex(PLUGIN_ID_PATTERN);

export const pluginSummarySchema = z.object({
	id: pluginId,
	name: z.string(),
	description: z.string(),
	/** Newest published version. */
	version: z.string(),
	apiVersion: z.number().int(),
	author: z.string().nullable(),
	/** Square image shown in the marketplace. */
	iconUrl: z.url().nullable(),
	keywords: z.array(z.string()),
	downloads: z.number().int().nonnegative(),
	/** Reviewed by the Pouchbase team. */
	verified: z.boolean(),
	updatedAt: z.iso.datetime()
});

export const pluginVersionSchema = z.object({
	version: z.string(),
	apiVersion: z.number().int(),
	/** Subresource Integrity of the bundle; see `computeIntegrity`. */
	integrity: z.string().startsWith('sha256-'),
	/** Size of the bundle in bytes. */
	size: z.number().int().nonnegative(),
	bundleUrl: z.url(),
	/** `engines.pouchbase` of the manifest, so a host can rule versions out before downloading. */
	pouchbase: z.string().nullable(),
	/** `permissions` of the manifest, shown to the admin before installing. */
	permissions: permissionsSchema,
	publishedAt: z.iso.datetime()
});

export const pluginDetailsSchema = pluginSummarySchema.extend({
	license: z.string(),
	homepage: z.url().nullable(),
	repository: z.url().nullable(),
	/** README as Markdown. */
	readme: z.string().nullable(),
	/** Newest first. */
	versions: z.array(pluginVersionSchema)
});

export const pluginListSchema = z.object({
	items: z.array(pluginSummarySchema),
	page: z.number().int().positive(),
	perPage: z.number().int().positive(),
	total: z.number().int().nonnegative()
});

export const registryErrorBodySchema = z.object({
	error: z.object({
		/** Machine-readable, e.g. `not_found`, `version_exists`, `invalid_bundle`, `unauthorized`. */
		code: z.string(),
		message: z.string(),
		/** Problems with a published bundle. */
		issues: z.array(z.object({ path: z.string(), message: z.string() })).optional()
	})
});

export type PluginSummary = z.output<typeof pluginSummarySchema>;

export type PluginVersion = z.output<typeof pluginVersionSchema>;

export type PluginDetails = z.output<typeof pluginDetailsSchema>;

export type PluginList = z.output<typeof pluginListSchema>;

export type RegistryErrorBody = z.output<typeof registryErrorBodySchema>;

export type SearchOptions = {
	query?: string;
	page?: number;
	perPage?: number;
	/** Only plugins with one of these API versions, usually `SUPPORTED_API_VERSIONS`. */
	apiVersions?: readonly number[];
};

/** A failed registry request. `status` is 0 when the registry couldn't be reached. */
export class RegistryError extends Error {
	override name = 'RegistryError';

	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly issues: { path: string; message: string }[] = []
	) {
		super(message);
	}
}

export type RegistryClientOptions = {
	/** Base URL of the registry, without `/v1`. Defaults to `DEFAULT_REGISTRY_URL`. */
	url?: string;
	/** Needed to publish. */
	token?: string;
	fetch?: typeof fetch;
};

export type RegistryClient = {
	search(options?: SearchOptions): Promise<PluginList>;
	/** `null` when the plugin doesn't exist. */
	get(id: string): Promise<PluginDetails | null>;
	/** `null` when the plugin or version doesn't exist. */
	getVersion(
		id: string,
		version: string,
		apiVersions?: readonly number[]
	): Promise<PluginVersion | null>;
	/** Downloads a bundle and checks it against the version's integrity. */
	download(version: PluginVersion): Promise<Uint8Array<ArrayBuffer>>;
	publish(id: string, bundle: Uint8Array<ArrayBuffer>): Promise<PluginVersion>;
};

export function createRegistryClient(options: RegistryClientOptions = {}): RegistryClient {
	const base = (options.url ?? DEFAULT_REGISTRY_URL).replace(/\/+$/, '') + REGISTRY_API_PREFIX;
	const fetcher = options.fetch ?? fetch;

	async function send(path: string, init: RequestInit = {}): Promise<Response> {
		let response: Response;

		try {
			response = await fetcher(path.startsWith('http') ? path : base + path, {
				...init,
				headers: { Accept: 'application/json', ...init.headers }
			});
		} catch (error) {
			throw new RegistryError(0, 'unreachable', `Registry unreachable: ${String(error)}`);
		}

		if (!response.ok && response.status !== 404) {
			const body = registryErrorBodySchema.safeParse(await response.json().catch(() => null));

			throw body.success
				? new RegistryError(
						response.status,
						body.data.error.code,
						body.data.error.message,
						body.data.error.issues
					)
				: new RegistryError(response.status, 'unknown', `Registry responded ${response.status}`);
		}

		return response;
	}

	async function json<T>(schema: z.ZodType<T>, response: Response): Promise<T> {
		const result = schema.safeParse(await response.json().catch(() => null));

		if (!result.success) {
			throw new RegistryError(response.status, 'invalid_response', 'Unexpected registry response');
		}

		return result.data;
	}

	function apiVersionParams(params: URLSearchParams, apiVersions: readonly number[] = []) {
		for (const version of apiVersions) {
			params.append('apiVersion', String(version));
		}
	}

	return {
		async search({ query, page, perPage, apiVersions } = {}) {
			const params = new URLSearchParams();

			if (query) {
				params.set('q', query);
			}

			if (page) {
				params.set('page', String(page));
			}

			if (perPage) {
				params.set('perPage', String(perPage));
			}

			apiVersionParams(params, apiVersions);

			const response = await send(`/plugins?${params}`);

			if (response.status === 404) {
				throw new RegistryError(404, 'not_found', 'No plugin registry at this URL');
			}

			return json(pluginListSchema, response);
		},

		async get(id) {
			const response = await send(`/plugins/${encodeURIComponent(id)}`);

			return response.status === 404 ? null : json(pluginDetailsSchema, response);
		},

		async getVersion(id, version, apiVersions) {
			const params = new URLSearchParams();
			apiVersionParams(params, apiVersions);

			const response = await send(
				`/plugins/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}?${params}`
			);

			return response.status === 404 ? null : json(pluginVersionSchema, response);
		},

		async download(version) {
			const response = await send(version.bundleUrl);

			if (response.status === 404) {
				throw new RegistryError(404, 'not_found', 'Bundle not found');
			}

			const bytes = new Uint8Array(await response.arrayBuffer());

			if (!(await verifyIntegrity(bytes, version.integrity))) {
				throw new RegistryError(
					response.status,
					'integrity_mismatch',
					'The bundle does not match its integrity hash'
				);
			}

			return bytes;
		},

		async publish(id, bundle) {
			if (!options.token) {
				throw new RegistryError(401, 'unauthorized', 'A token is needed to publish');
			}

			const response = await send(`/plugins/${encodeURIComponent(id)}/versions`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
				body: bundle
			});

			if (response.status === 404) {
				throw new RegistryError(404, 'not_found', 'No plugin registry at this URL');
			}

			return json(pluginVersionSchema, response);
		}
	};
}
