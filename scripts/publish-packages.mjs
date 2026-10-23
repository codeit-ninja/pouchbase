// Builds and publishes the workspace packages in packages/ whose version isn't on npm yet (`pnpm
// release`, run by the Release workflow after the Version Packages pull request is merged). Packages
// that are already published aren't built, so a push without a new version builds nothing.
//
// pnpm packs each package, which applies its `publishConfig` (the plugin SDK swaps its source exports
// for dist), and npm publishes the tarball: npm does the trusted publishing (OIDC) exchange with
// GitHub Actions, so the workflow needs no npm token. Run locally, npm uses your own login instead.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packagesDir = path.join(root, 'packages');
const shell = process.platform === 'win32';

/** Whether `name@version` already exists on the registry. */
function isPublished(name, version) {
	try {
		execFileSync('npm', ['view', `${name}@${version}`, 'version'], { stdio: 'pipe', shell });

		return true;
	} catch (error) {
		if (String(error.stderr).includes('E404')) {
			return false;
		}

		throw error;
	}
}

const outDir = mkdtempSync(path.join(tmpdir(), 'pouchbase-publish-'));
const failed = [];

try {
	for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}

		const dir = path.join(packagesDir, entry.name);
		const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));

		if (pkg.private) {
			continue;
		}

		const id = `${pkg.name}@${pkg.version}`;

		if (isPublished(pkg.name, pkg.version)) {
			console.log(`${id} is already published.`);
			continue;
		}

		try {
			const packDir = path.join(outDir, entry.name);

			execFileSync('pnpm', ['run', 'build'], { cwd: dir, stdio: 'inherit', shell });
			execFileSync('pnpm', ['pack', '--pack-destination', packDir], {
				cwd: dir,
				stdio: 'pipe',
				shell
			});

			const tarball = readdirSync(packDir).find((file) => file.endsWith('.tgz'));

			execFileSync('npm', ['publish', path.join(packDir, tarball), '--access', 'public'], {
				cwd: dir,
				stdio: 'inherit',
				shell
			});
			console.log(`Published ${id}.`);
		} catch {
			failed.push(id);
		}
	}
} finally {
	rmSync(outDir, { recursive: true, force: true });
}

if (failed.length > 0) {
	console.error(`Failed to publish: ${failed.join(', ')}`);
	process.exit(1);
}
