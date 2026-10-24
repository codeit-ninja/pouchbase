import { AuthStore, createClient } from '@pouchbasejs/js-sdk';
import type { Pouchbase, User } from '@pouchbasejs/js-sdk';

import { POUCHBASE_SERVICE_KEY } from '$app/env/private';
import { POUCHBASE_URL } from '$app/env/public';

/**
 * The Pouchbase instance behind the site: accounts are its `users`, and the plugin registry keeps
 * its data in three collections whose API rules are all Admins only. The site writes and reads
 * them with a service key (`service()`), after checking who may do what itself. See the README for
 * how to set up the collections.
 */

/** A plugin in the registry; `slug` is the manifest's `id`. */
export type PluginRecord = {
	id: string;
	slug: string;
	name: string;
	description: string;
	/** The user who published the first version; only they can publish more. */
	owner: string;
	author: string | null;
	license: string;
	homepage: string | null;
	repository: string | null;
	readme: string | null;
	icon_url: string | null;
	/** A JSON array. */
	keywords: string[];
	/** A JSON array: the manifest's categories, or the ones implied by what the plugin contributes. */
	categories: string[];
	/** `categories` as text such as `,auth,fields,`, so a filter can look for `,auth,`. */
	categories_text: string;
	/** Newest version and its API version. */
	version: string;
	api_version: number;
	/**
	 * Every API version the plugin has a version for, as text such as `,1,2,`, so a filter can look
	 * for `,1,` (a list field only takes values from a fixed list).
	 */
	api_versions: string;
	downloads: number;
	/** Reviewed by the Pouchbase team; only admins set it, in the dashboard. */
	verified: boolean;
	created_at: string;
	updated_at: string;
};

/** A published version of a plugin, with its bundle. */
export type PluginVersionRecord = {
	id: string;
	plugin: string;
	version: string;
	api_version: number;
	/** Subresource Integrity of `bundle`. */
	integrity: string;
	size: number;
	/** `engines.pouchbase` of the manifest. */
	pouchbase: string | null;
	permissions: { network: string[] };
	/** The bundle as published (JSON text), served byte for byte. */
	bundle: string;
	created_at: string;
	updated_at: string;
};

/** A token for `pouchbase-plugin publish`; only its hash is stored. */
export type PublishTokenRecord = {
	id: string;
	user: string;
	name: string;
	/** The first characters of the token, so it can be recognised in the list. */
	prefix: string;
	token_hash: string;
	last_used_at: string | null;
	created_at: string;
	updated_at: string;
};

export type Schema = {
	users: User;
	plugins: PluginRecord;
	plugin_versions: PluginVersionRecord;
	publish_tokens: PublishTokenRecord;
};

/** A client for the instance, signed in with the user's token when there is one. */
export function pouchbase(token?: string): Pouchbase<Schema> {
	return createClient<Schema>(POUCHBASE_URL ?? '', {
		authStore: token ? new AuthStore({ token, userId: '', user: null }) : undefined
	});
}

/** A client with the service key: API rules don't apply to it. Server-side only. */
export function service(): Pouchbase<Schema> {
	return createClient<Schema>(POUCHBASE_URL ?? '', { apiKey: POUCHBASE_SERVICE_KEY }).asService();
}
