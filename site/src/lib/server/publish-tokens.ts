import type { PublishTokenRecord } from './pouchbase';

import { pouchbase, service } from './pouchbase';
import { backendFailure } from './registry';

/**
 * Publish tokens: secrets for `pouchbase-plugin publish` (`POUCHBASE_REGISTRY_TOKEN`), made on the
 * account pages. A token publishes as the user who made it; only its SHA-256 hash is stored.
 */

/** Prefix of publish tokens, so they are recognisable (e.g. by secret scanners). */
export const PUBLISH_TOKEN_PREFIX = 'pbp_';

/** `last_used_at` is written at most this often per token. */
const LAST_USED_INTERVAL = 60 * 1000;

/** A token as the account pages list it; the token itself is only shown once. */
export type PublishToken = Pick<PublishTokenRecord, 'id' | 'name' | 'prefix'> & {
	createdAt: string;
	lastUsedAt: string | null;
};

async function hashToken(token: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));

	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toToken(record: PublishTokenRecord): PublishToken {
	return {
		id: record.id,
		name: record.name,
		prefix: record.prefix,
		createdAt: record.created_at,
		lastUsedAt: record.last_used_at
	};
}

/** The user's tokens, newest first. */
export async function listPublishTokens(userId: string): Promise<PublishToken[]> {
	const records = await service().db.publish_tokens.findAll({
		where: { user: userId },
		orderBy: { created_at: 'desc' }
	});

	return records.map(toToken);
}

/** Makes a token for the user; `token` can't be read back later. */
export async function createPublishToken(
	userId: string,
	name: string
): Promise<PublishToken & { token: string }> {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const token = PUBLISH_TOKEN_PREFIX + btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '');
	const record = await service().db.publish_tokens.insert({
		user: userId,
		name,
		prefix: token.slice(0, PUBLISH_TOKEN_PREFIX.length + 6),
		token_hash: await hashToken(token),
		last_used_at: null
	});

	return { ...toToken(record), token };
}

/** Deletes one of the user's tokens; `false` when the user has no token with this id. */
export async function deletePublishToken(userId: string, id: string): Promise<boolean> {
	const db = service().db;
	const record = await db.publish_tokens.findFirst({ where: { id, user: userId } });

	if (!record) {
		return false;
	}

	await db.publish_tokens.remove(id);

	return true;
}

/**
 * The id of the user a bearer token publishes as: a publish token (`pbp_…`) or the token of a
 * signed-in user. `null` for an unknown or expired token; a `RegistryFailure` when the instance
 * can't be reached.
 */
export async function publisherOf(token: string): Promise<string | null> {
	if (!token.startsWith(PUBLISH_TOKEN_PREFIX)) {
		const user = await pouchbase(token)
			.auth.me()
			.catch(() => null);

		return user?.id ?? null;
	}

	const db = service().db;
	const record = await db.publish_tokens
		.findFirst({ where: { token_hash: await hashToken(token) } })
		.catch(backendFailure);

	if (!record) {
		return null;
	}

	const lastUsed = record.last_used_at ? new Date(record.last_used_at).getTime() : 0;

	if (Date.now() - lastUsed > LAST_USED_INTERVAL) {
		await db.publish_tokens
			.patch(record.id, { last_used_at: new Date().toISOString() })
			.catch((error: unknown) => console.error('Updating last_used_at of a token failed', error));
	}

	return record.user;
}
