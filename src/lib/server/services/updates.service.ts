import type { ServiceError } from './base.service';
import type { Release, UpdateStatus, WorkerManifest } from '#lib/updates.js';
import type { ResultAsync } from 'neverthrow';

import { errAsync, fromPromise, okAsync } from 'neverthrow';

import { compareVersions, WORKER_FILES_ASSET } from '#lib/updates.js';

import { version as CURRENT_VERSION } from '../../../../package.json';
import { selfUpdate } from '../platform';
import { latestRelease, releaseFile, workerManifest } from '../releases';
import { nodeRuntime, runtime } from '../runtime';
import { Service } from './base.service';

/** How long the latest release from GitHub is reused before it is looked up again. */
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

interface UpdateCheck {
	checkedAt: string | null;
	latest: Release | null;
}

type StatusFailed = ServiceError<21000, 'GET_UPDATE_STATUS_FAILED'>;
type NotSupported = ServiceError<21001, 'UPDATE_NOT_SUPPORTED'>;
type NoUpdate = ServiceError<21002, 'NO_UPDATE_AVAILABLE'>;
type PrepareFailed = ServiceError<21003, 'PREPARE_UPDATE_FAILED'> & { data: { reason: string } };
type DownloadFailed = ServiceError<21004, 'DOWNLOAD_UPDATE_FAILED'> & { data: { reason: string } };
type UploadFailed = ServiceError<21005, 'UPLOAD_ASSETS_FAILED'> & { data: { reason: string } };
type InvalidModules = ServiceError<21006, 'INVALID_MODULES'>;
type DeployFailed = ServiceError<21007, 'DEPLOY_UPDATE_FAILED'> & { data: { reason: string } };
type BinaryFailed = ServiceError<21008, 'BINARY_UPDATE_FAILED'> & { data: { reason: string } };

function reason(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function parseCheck(value: string | null): UpdateCheck | null {
	if (!value) {
		return null;
	}

	try {
		return JSON.parse(value) as UpdateCheck;
	} catch {
		return null;
	}
}

async function sha256(blob: Blob) {
	const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());

	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Updates of Pouchbase itself. The latest release is looked up on GitHub at most every six hours
 * (`update_check` in the settings). How an instance updates depends on where it runs (see
 * `#lib/updates.ts`): a Worker deploys the release to itself, with the update dialog moving the
 * files (`prepareWorker`, `workerFiles`, `uploadWorkerAssets`, `deployWorker`), so no single request
 * does much work; the single binary replaces itself and restarts (`updateBinary`).
 */
export class UpdatesService extends Service {
	/** The running version, the latest release and whether this instance can install it. */
	status({ refresh = false } = {}): ResultAsync<UpdateStatus, StatusFailed> {
		const settings = this.services.settings();

		return settings
			.get('update_check')
			.mapErr((error) => this.error(21000, 'GET_UPDATE_STATUS_FAILED', error))
			.andThen((value) => {
				const cached = parseCheck(value);
				const fresh =
					cached?.checkedAt && Date.now() - new Date(cached.checkedAt).getTime() < CHECK_INTERVAL;

				if (fresh && !refresh) {
					return okAsync(cached);
				}

				// GitHub being unreachable isn't an error here: the previous answer is kept.
				return fromPromise(latestRelease(), (error) => error)
					.map((latest): UpdateCheck | null => ({ checkedAt: new Date().toISOString(), latest }))
					.orElse((error) => {
						console.error('[pouchbase] Could not look up the latest release', error);

						return okAsync(null);
					})
					.andThen((check) =>
						check
							? settings
									.set('update_check', JSON.stringify(check))
									.map(() => check)
									.mapErr((error) => this.error(21000, 'GET_UPDATE_STATUS_FAILED', error))
							: okAsync(cached ?? { checkedAt: null, latest: null })
					);
			})
			.map((check) => ({
				current: CURRENT_VERSION,
				runtime: runtime(),
				latest: check.latest,
				available: !!check.latest && compareVersions(check.latest.version, CURRENT_VERSION) > 0,
				checkedAt: check.checkedAt
			}));
	}

	/**
	 * The version to install: the latest release, when it is newer than this one. With `refresh`,
	 * GitHub is asked again instead of using the answer of the last six hours, which may name a
	 * release that has been superseded since.
	 */
	private target({ refresh = false } = {}): ResultAsync<string, StatusFailed | NoUpdate> {
		return this.status({ refresh }).andThen((status) =>
			status.available && status.latest
				? okAsync(status.latest.version)
				: errAsync(this.error(21002, 'NO_UPDATE_AVAILABLE'))
		);
	}

	private requireRuntime(kind: UpdateStatus['runtime']): ResultAsync<void, NotSupported> {
		return runtime() === kind
			? okAsync(undefined)
			: errAsync(this.error(21001, 'UPDATE_NOT_SUPPORTED'));
	}

	/**
	 * Starts updating the Worker to the latest release: registers its assets with Cloudflare. The
	 * dialog then uploads the hashes in `buckets` (`uploadWorkerAssets`), one request per bucket, and
	 * deploys with the completion token (`deployWorker`). When `buckets` is empty, `jwt` is the
	 * completion token already. The latest release is looked up again first, so `deployWorker`
	 * installs the same version from the refreshed check.
	 */
	prepareWorker(): ResultAsync<
		{ version: string; jwt: string; buckets: string[][] },
		NotSupported | StatusFailed | NoUpdate | PrepareFailed
	> {
		return this.requireRuntime('workers')
			.andThen(() => this.target({ refresh: true }))
			.andThen((version) =>
				fromPromise(
					(async () => {
						const manifest = await workerManifest(version);
						const session = await selfUpdate.startAssetUpload(manifest);

						return { version, ...session };
					})(),
					(error): PrepareFailed => ({
						...this.error(21003, 'PREPARE_UPDATE_FAILED', error),
						data: { reason: reason(error) }
					})
				)
			);
	}

	/**
	 * The contents of the modules and assets of a release (`pouchbase-worker-files.json.gz`), as
	 * GitHub serves it, so the dialog can read them without depending on GitHub's CORS headers.
	 */
	workerFiles(version: string): ResultAsync<Response, DownloadFailed> {
		return fromPromise(releaseFile(version, WORKER_FILES_ASSET), (error): DownloadFailed => ({
			...this.error(21004, 'DOWNLOAD_UPDATE_FAILED', error),
			data: { reason: reason(error) }
		}));
	}

	/**
	 * Uploads one bucket of assets (a multipart body with the base64 contents per hash) with the
	 * upload token of `prepareWorker`. Returns the completion token after the last bucket.
	 */
	uploadWorkerAssets(
		jwt: string,
		body: ArrayBuffer,
		contentType: string
	): ResultAsync<string | null, NotSupported | UploadFailed> {
		return this.requireRuntime('workers').andThen(() =>
			fromPromise(selfUpdate.uploadAssets(jwt, body, contentType), (error): UploadFailed => ({
				...this.error(21005, 'UPLOAD_ASSETS_FAILED', error),
				data: { reason: reason(error) }
			}))
		);
	}

	/**
	 * Deploys the latest release to the Worker with the uploaded assets. The modules come from the
	 * dialog, which read them from the release; each must match its SHA-256 in the manifest.
	 */
	deployWorker(
		assetsJwt: string,
		modules: Map<string, Blob>
	): ResultAsync<string, NotSupported | StatusFailed | NoUpdate | InvalidModules | DeployFailed> {
		return this.requireRuntime('workers')
			.andThen(() => this.target())
			.andThen((version) =>
				fromPromise(workerManifest(version), (error): DeployFailed => ({
					...this.error(21007, 'DEPLOY_UPDATE_FAILED', error),
					data: { reason: reason(error) }
				}))
			)
			.andThen((manifest) => this.verifyModules(manifest, modules).map(() => manifest))
			.andThen((manifest) =>
				fromPromise(
					selfUpdate.deployWorker(manifest, assetsJwt, modules).then(() => manifest.version),
					(error): DeployFailed => ({
						...this.error(21007, 'DEPLOY_UPDATE_FAILED', error),
						data: { reason: reason(error) }
					})
				)
			);
	}

	private verifyModules(
		manifest: WorkerManifest,
		modules: Map<string, Blob>
	): ResultAsync<void, InvalidModules> {
		return fromPromise(
			(async () => {
				for (const module of manifest.modules) {
					const contents = modules.get(module.name);

					if (!contents || (await sha256(contents)) !== module.sha256) {
						throw new Error(`Module ${module.name} doesn't match the release`);
					}
				}
			})(),
			(error) => this.error(21006, 'INVALID_MODULES', error)
		);
	}

	/**
	 * Replaces the single binary with the latest release and restarts it right after the response.
	 * Returns the installed version.
	 */
	updateBinary(): ResultAsync<string, NotSupported | NoUpdate | BinaryFailed> {
		const node = nodeRuntime();

		return this.requireRuntime('binary')
			.andThen(() =>
				node?.update && node.restart
					? okAsync({ update: node.update, restart: node.restart })
					: errAsync(this.error(21001, 'UPDATE_NOT_SUPPORTED'))
			)
			.andThen(({ update, restart }) =>
				fromPromise(update(), (error): BinaryFailed => ({
					...this.error(21008, 'BINARY_UPDATE_FAILED', error),
					data: { reason: reason(error) }
				})).andThen((installed) => {
					if (!installed) {
						return errAsync(this.error(21002, 'NO_UPDATE_AVAILABLE'));
					}

					// After the response is out; the dialog waits for the new version to answer.
					setTimeout(restart, 1000);

					return okAsync(installed);
				})
			);
	}
}
