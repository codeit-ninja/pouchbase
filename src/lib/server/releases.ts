import type { Release, WorkerManifest } from '#lib/updates.js';

import { REPOSITORY, WORKER_MANIFEST_ASSET } from '#lib/updates.js';

/**
 * The releases of Pouchbase on GitHub (throws). The API allows 60 unauthenticated requests per hour
 * per IP address, which Workers share with many others, so the latest release falls back to the
 * redirect of `github.com/<repo>/releases/latest`. Release files are downloaded from github.com,
 * which has no such limit.
 */

const HEADERS = { 'user-agent': 'pouchbase-update' };

interface GitHubRelease {
	tag_name: string;
	html_url: string;
	published_at: string | null;
}

function version(tag: string) {
	return tag.replace(/^v/, '');
}

/** The latest release (prereleases excluded). */
export async function latestRelease(): Promise<Release> {
	const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
		headers: { ...HEADERS, accept: 'application/vnd.github+json' }
	});

	if (response.ok) {
		const release = (await response.json()) as GitHubRelease;

		return {
			version: version(release.tag_name),
			url: release.html_url,
			publishedAt: release.published_at
		};
	}

	await response.body?.cancel();

	// Rate limited: `/releases/latest` redirects to `/releases/tag/<tag>`.
	const redirect = await fetch(`https://github.com/${REPOSITORY}/releases/latest`, {
		headers: HEADERS,
		redirect: 'manual'
	});

	await redirect.body?.cancel();

	const tag = /\/releases\/tag\/([^/?#]+)/.exec(redirect.headers.get('location') ?? '')?.[1];

	if (!tag) {
		throw new Error(`Could not look up the latest release on GitHub (${response.status})`);
	}

	return {
		version: version(decodeURIComponent(tag)),
		url: `https://github.com/${REPOSITORY}/releases/tag/${tag}`,
		publishedAt: null
	};
}

/** A file attached to the release of `version`, as GitHub serves it. Throws when it's missing. */
export async function releaseFile(releaseVersion: string, name: string) {
	const response = await fetch(
		`https://github.com/${REPOSITORY}/releases/download/v${releaseVersion}/${name}`,
		{ headers: HEADERS }
	);

	if (!response.ok) {
		await response.body?.cancel();

		throw new Error(
			response.status === 404
				? `Release ${releaseVersion} has no ${name}`
				: `Could not download ${name} of ${releaseVersion} (${response.status})`
		);
	}

	return response;
}

/** The Worker manifest of a release (see `#lib/updates.ts`). */
export async function workerManifest(releaseVersion: string): Promise<WorkerManifest> {
	const manifest = (await (
		await releaseFile(releaseVersion, WORKER_MANIFEST_ASSET)
	).json()) as WorkerManifest;

	if (manifest.format !== 1 || manifest.version !== releaseVersion) {
		throw new Error(`The Worker manifest of ${releaseVersion} is not one this version can install`);
	}

	return manifest;
}
