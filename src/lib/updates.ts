/**
 * Updates of Pouchbase itself, shared by the server (`UpdatesService`) and the update dialog.
 *
 * Every release on GitHub carries what each runtime needs to update in place: the Docker image, the
 * single binaries and, for the Worker, `pouchbase-worker.json` (the manifest: Worker settings,
 * modules and the hashes of the static assets) and `pouchbase-worker-files.json.gz` (the contents of
 * the modules and assets, keyed by name and hash). `scripts/worker-bundle.mjs` makes both.
 */

export const REPOSITORY = 'pouchbase/pouchbase';

export const WORKER_MANIFEST_ASSET = 'pouchbase-worker.json';

export const WORKER_FILES_ASSET = 'pouchbase-worker-files.json.gz';

/**
 * Where this instance runs, which decides how it updates: a Worker deploys the new version to
 * itself, the single binary replaces itself and restarts, the others show what to run.
 */
export type Runtime = 'workers' | 'binary' | 'docker' | 'node' | 'dev';

export interface Release {
	version: string;
	url: string;
	publishedAt: string | null;
}

export interface UpdateStatus {
	current: string;
	runtime: Runtime;
	/** The latest release, or `null` when GitHub couldn't be reached. */
	latest: Release | null;
	available: boolean;
	/** When GitHub was last asked, as an ISO date. */
	checkedAt: string | null;
}

/** A module of the Worker in the manifest; its contents are in the files under `modules[name]`. */
export interface WorkerModule {
	name: string;
	/** Content type of the upload part, e.g. `application/javascript+module` or `application/wasm`. */
	type: string;
	size: number;
	sha256: string;
}

export interface WorkerAsset {
	/** 32 hex characters: the start of the SHA-256 of the file, as Cloudflare's asset manifest wants. */
	hash: string;
	size: number;
	type: string;
}

export interface WorkerMigration {
	tag: string;
	[step: string]: unknown;
}

export interface WorkerManifest {
	format: 1;
	version: string;
	worker: {
		main_module: string;
		compatibility_date: string;
		compatibility_flags: string[];
		/** The bindings the release defines itself (assets, Durable Objects); others are kept. */
		bindings: { type: string; name: string; [key: string]: unknown }[];
		migrations: WorkerMigration[];
		crons: string[];
	};
	modules: WorkerModule[];
	assets: {
		config: { _headers?: string; _redirects?: string };
		/** By path, with a leading slash. */
		files: Record<string, WorkerAsset>;
	};
}

/**
 * `pouchbase-worker-files.json.gz`: the base64 contents of the modules by name, and of the assets by
 * hash with the content type they are served with.
 */
export interface WorkerFiles {
	modules: Record<string, string>;
	assets: Record<string, { type: string; content: string }>;
}

function parseVersion(version: string) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(version);

	if (!match) {
		return null;
	}

	return { numbers: match.slice(1, 4).map(Number), prerelease: match[4] ?? null };
}

/**
 * Negative when `a` is older than `b`, positive when it is newer, 0 when they are equal or either
 * isn't a version. Same rules as `server-update.mjs`.
 */
export function compareVersions(a: string, b: string) {
	const left = parseVersion(a);
	const right = parseVersion(b);

	if (!left || !right) {
		return 0;
	}

	for (let i = 0; i < 3; i++) {
		if (left.numbers[i] !== right.numbers[i]) {
			return left.numbers[i] - right.numbers[i];
		}
	}

	if (left.prerelease === right.prerelease) {
		return 0;
	}

	// A version without a prerelease tag comes after its prereleases.
	if (left.prerelease === null) {
		return 1;
	}

	if (right.prerelease === null) {
		return -1;
	}

	return left.prerelease < right.prerelease ? -1 : 1;
}
