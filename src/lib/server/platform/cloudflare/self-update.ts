import type { WorkerManifest } from '#lib/updates.js';

import { api, cloudflareFetch, failure } from './api';
import { WORKER_NAME } from './insights';

/**
 * Deploys a release of Pouchbase to the Worker that runs it, the way `wrangler deploy` would:
 * register the static assets (Cloudflare answers which ones it doesn't have yet), upload those,
 * then upload the script with the assets and the bindings. The databases and secrets aren't in the
 * release: every binding the release doesn't define itself is kept with `inherit`. Like a
 * `wrangler deploy`, the upload sets the Worker's other settings to those of the release.
 */

interface ScriptSettings {
	bindings?: { type: string; name: string }[];
}

const script = `/workers/scripts/${encodeURIComponent(WORKER_NAME)}`;

/**
 * Starts an upload session for the assets of a release. `buckets` lists the hashes of the files to
 * upload, in groups that each go in one request; when it's empty, `jwt` is already the completion
 * token.
 */
export async function startAssetUpload(manifest: WorkerManifest) {
	const files = Object.fromEntries(
		Object.entries(manifest.assets.files).map(([path, { hash, size }]) => [path, { hash, size }])
	);

	return api<{ jwt: string; buckets: string[][] }>(`${script}/assets-upload-session`, {
		method: 'POST',
		body: JSON.stringify({ manifest: files })
	});
}

/**
 * Uploads one bucket of assets: a `multipart/form-data` body with a field per hash and the file's
 * base64 contents as value. Returns the completion token after the last bucket, `null` before.
 */
export async function uploadAssets(jwt: string, body: ArrayBuffer, contentType: string) {
	const response = await cloudflareFetch('/workers/assets/upload?base64=true', {
		method: 'POST',
		headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': contentType },
		body
	});

	if (!response.ok) {
		throw await failure(response);
	}

	const { result } = (await response.json()) as { result: { jwt?: string } | null };

	return result?.jwt ?? null;
}

/** The Durable Object migrations to send, given the tag the Worker is at (same as Wrangler). */
function migrationsFrom(
	tag: string | undefined,
	migrations: WorkerManifest['worker']['migrations']
) {
	if (!migrations.length) {
		return undefined;
	}

	// A step is a migration without its tag.
	const steps = (list: typeof migrations) =>
		list.map((migration) =>
			Object.fromEntries(Object.entries(migration).filter(([key]) => key !== 'tag'))
		);
	const newTag = migrations[migrations.length - 1].tag;

	if (!tag) {
		return { new_tag: newTag, steps: steps(migrations) };
	}

	const index = migrations.findIndex((migration) => migration.tag === tag);

	if (index === migrations.length - 1) {
		return undefined;
	}

	return { old_tag: tag, new_tag: newTag, steps: steps(migrations.slice(index + 1)) };
}

/**
 * Uploads and deploys the script of a release with the assets of `assetsJwt` (the completion token
 * of the asset upload) and sets its Cron Triggers.
 */
export async function deployWorker(
	manifest: WorkerManifest,
	assetsJwt: string,
	modules: Map<string, Blob>
) {
	const [settings, service] = await Promise.all([
		api<ScriptSettings>(`${script}/settings`),
		api<{ default_environment?: { script?: { migration_tag?: string } } }>(
			`/workers/services/${encodeURIComponent(WORKER_NAME)}`
		)
	]);

	const { worker } = manifest;
	const defined = new Set(worker.bindings.map((binding) => binding.name));
	const kept = (settings.bindings ?? []).filter((binding) => !defined.has(binding.name));
	const migrations = migrationsFrom(
		service.default_environment?.script?.migration_tag,
		worker.migrations
	);

	const metadata = {
		main_module: worker.main_module,
		compatibility_date: worker.compatibility_date,
		compatibility_flags: worker.compatibility_flags,
		bindings: [...worker.bindings, ...kept.map(({ name }) => ({ type: 'inherit', name }))],
		assets: { jwt: assetsJwt, config: manifest.assets.config },
		annotations: {
			'workers/message': `Pouchbase ${manifest.version}`,
			'workers/tag': `v${manifest.version}`
		},
		...(migrations && { migrations })
	};

	const body = new FormData();
	body.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

	for (const module of manifest.modules) {
		const contents = modules.get(module.name);

		if (!contents) {
			throw new Error(`Missing module ${module.name}`);
		}

		body.set(module.name, new File([contents], module.name, { type: module.type }));
	}

	const uploaded = await cloudflareFetch(script, { method: 'PUT', body });

	if (!uploaded.ok) {
		throw await failure(uploaded);
	}

	await uploaded.body?.cancel();

	await api(`${script}/schedules`, {
		method: 'PUT',
		body: JSON.stringify(worker.crons.map((cron) => ({ cron })))
	});
}
