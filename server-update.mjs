/**
 * The `update` command of the single binary (see `server.mjs`): looks up the latest release of
 * Pouchbase on GitHub, downloads the binary for this platform (the names `.github/workflows/binaries.yml`
 * attaches, built by `scripts/build-binary.mjs`) and replaces the running executable with it.
 *
 * The download is checked against the SHA-256 digest GitHub keeps for every release asset and run
 * once with `--version` before it replaces anything. It is written next to the executable, so the
 * replacement is a rename on the same file system. Linux and macOS allow renaming over a running
 * executable; Windows doesn't, but it allows renaming the running one away, so there the old binary
 * is moved to `<name>.old` first and removed the next time Pouchbase starts.
 *
 * `GITHUB_TOKEN` is sent along when it is set, for the higher API rate limit.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const REPOSITORY = 'pouchbase/pouchbase';

/** The release asset for this platform, named like `scripts/build-binary.mjs` names the output. */
function assetName() {
	const platform = { win32: 'windows', darwin: 'macos' }[process.platform] ?? process.platform;

	return `pouchbase-${platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`;
}

function parseVersion(version) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(version);

	if (!match) {
		throw new Error(`Invalid version "${version}"`);
	}

	return { numbers: match.slice(1, 4).map(Number), prerelease: match[4] ?? null };
}

/** Negative when `a` is older than `b`, positive when it is newer, 0 when they are equal. */
function compareVersions(a, b) {
	const left = parseVersion(a);
	const right = parseVersion(b);

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

async function latestRelease() {
	const headers = { accept: 'application/vnd.github+json', 'user-agent': 'pouchbase-update' };

	if (process.env.GITHUB_TOKEN) {
		headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	}

	const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
		headers
	});

	if (!response.ok) {
		throw new Error(
			`Couldn't look up the latest release on GitHub: ${response.status} ${response.statusText}`
		);
	}

	return response.json();
}

function isPermissionError(error) {
	return error?.code === 'EACCES' || error?.code === 'EPERM';
}

/** Replaces `target` with `download`, both in the same directory. */
function replace(target, download) {
	if (process.platform !== 'win32') {
		renameSync(download, target);

		return;
	}

	const old = `${target}.old`;

	rmSync(old, { force: true });
	renameSync(target, old);

	try {
		renameSync(download, target);
	} catch (error) {
		renameSync(old, target);
		throw error;
	}
}

/**
 * @param {string} currentVersion
 * @param {{ check?: boolean }} options `check` only reports whether an update is available.
 * @returns {Promise<string | null>} The version it installed, or `null` when it installed none.
 */
export async function update(currentVersion, { check = false } = {}) {
	console.log(`Checking ${REPOSITORY} for a newer version`);

	const release = await latestRelease();
	const latestVersion = release.tag_name.replace(/^v/, '');

	if (compareVersions(latestVersion, currentVersion) <= 0) {
		console.log(`Pouchbase ${currentVersion} is up to date.`);

		return null;
	}

	if (check) {
		console.log(
			`Pouchbase ${latestVersion} is available (this is ${currentVersion}). Run \`pouchbase update\` to install it.`
		);

		return null;
	}

	const name = assetName();
	const asset = release.assets.find((candidate) => candidate.name === name);

	if (!asset) {
		throw new Error(
			`Release ${release.tag_name} has no ${name} (yet). The binaries are attached a few minutes after the release; try again later, or see ${release.html_url}.`
		);
	}

	console.log(`Downloading ${name} ${latestVersion} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`);

	const response = await fetch(asset.browser_download_url, {
		headers: { 'user-agent': 'pouchbase-update' }
	});

	if (!response.ok) {
		throw new Error(`Couldn't download ${name}: ${response.status} ${response.statusText}`);
	}

	const data = Buffer.from(await response.arrayBuffer());

	if (asset.digest?.startsWith('sha256:')) {
		const digest = createHash('sha256').update(data).digest('hex');

		if (`sha256:${digest}` !== asset.digest) {
			throw new Error(`The download of ${name} doesn't match its digest on GitHub.`);
		}
	}

	const target = realpathSync(process.execPath);
	const download = `${target}.download`;

	try {
		writeFileSync(download, data, { mode: 0o755 });

		const version = execFileSync(download, ['--version'], { encoding: 'utf8' }).trim();

		if (version !== latestVersion) {
			throw new Error(`The downloaded binary reports version "${version}", not ${latestVersion}.`);
		}

		replace(target, download);
	} catch (error) {
		rmSync(download, { force: true });

		if (isPermissionError(error)) {
			throw new Error(
				`No permission to replace ${target}; run the update ${process.platform === 'win32' ? 'as administrator' : 'with sudo'}.`,
				{ cause: error }
			);
		}

		throw error;
	}

	console.log(
		`Updated Pouchbase from ${currentVersion} to ${latestVersion}. Restart the server to run the new version.`
	);

	return latestVersion;
}
