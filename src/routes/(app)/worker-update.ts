import type { WorkerFiles } from '#lib/updates.js';

import { resolve } from '$app/paths';

import { getRunningVersion, prepareWorkerUpdate } from '#lib/remote/updates.remote.js';

/**
 * The browser's part of updating a Worker to the latest release. The Worker only passes requests on
 * to Cloudflare, so no single request of it does much work (the Free plan allows 10 ms of CPU per
 * request): the browser downloads the release files, unpacks them and sends the assets Cloudflare
 * asks for, one bucket per request, then the modules.
 */

export type UpdateStep = 'download' | 'upload' | 'deploy' | 'restart';

export interface UpdateProgress {
	step: UpdateStep;
	/** Asset buckets uploaded so far, out of `total`. */
	done?: number;
	total?: number;
}

async function failure(response: Response) {
	const body = (await response.json().catch(() => null)) as { message?: string } | null;

	return new Error(body?.message ?? `${response.status} ${response.statusText}`);
}

function bytes(base64: string) {
	return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/** Resolves once the server answers with `version`, polling every two seconds for two minutes. */
export async function waitForVersion(version: string) {
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			if ((await getRunningVersion()) === version) {
				return;
			}
		} catch {
			// Restarting.
		}

		await new Promise((done) => setTimeout(done, 2000));
	}

	throw new Error(`Version ${version} did not start within two minutes; reload the page to check`);
}

/** Updates the Worker to the latest release; resolves with its version once it runs. */
export async function updateWorker(onProgress: (progress: UpdateProgress) => void) {
	const { version, jwt, buckets } = await prepareWorkerUpdate();

	onProgress({ step: 'download' });

	const download = await fetch(
		`${resolve('/(app)/update/files')}?version=${encodeURIComponent(version)}`
	);

	if (!download.ok || !download.body) {
		throw await failure(download);
	}

	const files = (await new Response(
		download.body.pipeThrough(new DecompressionStream('gzip'))
	).json()) as WorkerFiles;

	let completion = buckets.length ? null : jwt;

	for (const [index, bucket] of buckets.entries()) {
		onProgress({ step: 'upload', done: index, total: buckets.length });

		const body = new FormData();

		for (const hash of bucket) {
			const asset = files.assets[hash];

			if (!asset) {
				throw new Error(`The release has no file with hash ${hash}`);
			}

			body.append(hash, new File([asset.content], hash, { type: asset.type }));
		}

		const response = await fetch(resolve('/(app)/update/assets'), {
			method: 'POST',
			headers: { 'x-upload-token': jwt },
			body
		});

		if (!response.ok) {
			throw await failure(response);
		}

		completion = ((await response.json()) as { jwt: string | null }).jwt ?? completion;
	}

	if (!completion) {
		throw new Error('Cloudflare did not confirm the upload of the files');
	}

	onProgress({ step: 'deploy' });

	const body = new FormData();
	body.set('assets', completion);

	for (const [name, content] of Object.entries(files.modules)) {
		body.set(`module:${name}`, new Blob([bytes(content)]), name);
	}

	const deployed = await fetch(resolve('/(app)/update/deploy'), { method: 'POST', body });

	if (!deployed.ok) {
		throw await failure(deployed);
	}

	onProgress({ step: 'restart' });
	await waitForVersion(version);

	return version;
}
