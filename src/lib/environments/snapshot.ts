/**
 * Environments: a development instance publishes its schema and configuration to a production
 * instance, or pulls them from it. Both sides describe themselves as a snapshot
 * (`#lib/schemas/environments.js`); `./diff.ts` turns two snapshots into a plan.
 *
 * Shared between the client (showing a plan) and the server (building and applying it).
 */

import type { Snapshot } from '#lib/schemas/environments.js';

/** Version of the snapshot format; instances only exchange snapshots of the same format. */
export const SNAPSHOT_FORMAT = 1;

export const ENVIRONMENTS = ['development', 'production'] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

/**
 * Settings that travel with a snapshot. Secrets and settings that belong to the instance itself
 * (its databases, bucket, storage and Cloudflare plan) stay where they are.
 */
export const SNAPSHOT_SETTING_KEYS = [
	'auth_password_enabled',
	'auth_password_signup',
	'mail_provider',
	'mail_sender_name',
	'mail_sender_address',
	'smtp_host',
	'smtp_port',
	'smtp_security',
	'smtp_username'
] as const;

export type SnapshotSettingKey = (typeof SNAPSHOT_SETTING_KEYS)[number];

/** Secret settings a snapshot only reports as filled in or not, for the warnings of a plan. */
export const SNAPSHOT_SECRET_KEYS = ['smtp_password'] as const;

export type SnapshotSecretKey = (typeof SNAPSHOT_SECRET_KEYS)[number];

/** JSON with the keys of every object sorted, so equal snapshots give equal strings. */
export function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}

	if (value && typeof value === 'object') {
		const entries = Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

		return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
	}

	return JSON.stringify(value);
}

/**
 * SHA-256 of the snapshot's contents, without when and where it was made. A plan carries the hash
 * of the target it was made for, so it is only applied while the target is still in that state.
 */
export async function snapshotHash(snapshot: Snapshot) {
	const contents: Partial<Snapshot> = { ...snapshot };

	delete contents.createdAt;
	delete contents.instance;
	delete contents.environment;

	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(stableStringify(contents))
	);

	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
