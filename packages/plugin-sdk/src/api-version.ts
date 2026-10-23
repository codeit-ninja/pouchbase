/**
 * Version of the plugin contract: the manifest, the bundle format, the server API
 * (`definePlugin`) and the props that UI components receive.
 *
 * Within one API version, changes are additive only: new optional manifest fields, new
 * contribution kinds and new members of the plugin context. A host ignores what it doesn't know, so a
 * plugin that needs a newer addition declares the lowest Pouchbase version it works with in
 * `engines.pouchbase`. Anything that would break an existing plugin bumps the API version; a host
 * supports the current version and the one before it.
 */
export const API_VERSION = 1;

/** The API versions a host of this SDK version can install. */
export const SUPPORTED_API_VERSIONS: readonly number[] = [1];

export function isSupportedApiVersion(version: number): boolean {
	return SUPPORTED_API_VERSIONS.includes(version);
}
