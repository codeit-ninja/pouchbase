// Publishes the first-party plugins in plugins/ whose version isn't on the plugin registry yet (`pnpm
// release:plugins`, run by the Release workflow after the Version Packages pull request is merged).
// Plugins that are already published aren't built, so a push without a new version publishes nothing.
//
// The plugin id comes from each plugin's pouchbase-plugin.json and the version from its package.json
// (bumped by Changesets). The registry is POUCHBASE_REGISTRY_URL (default https://api.pouchbase.io)
// and publishing needs POUCHBASE_REGISTRY_TOKEN; without a token it warns and publishes nothing.
//
// It uses the built plugin SDK (packages/plugin-sdk/dist, `pnpm --filter @pouchbasejs/plugin-sdk
// build`): its registry client to check the versions and its CLI to build and publish each bundle.
// The CLI is run with node directly instead of through the `pouchbase-plugin` bin, which pnpm doesn't
// link when dist/ didn't exist at install time.
//
// Usage: node scripts/publish-plugins.mjs [--dry-run]
//   --dry-run  only check the registry and list what would be published (no token needed)

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const pluginsDir = path.join(root, 'plugins');
const sdkDist = path.join(root, 'packages', 'plugin-sdk', 'dist');
const cli = path.join(sdkDist, 'cli.js');
const dryRun = process.argv.includes('--dry-run');

if (!existsSync(cli) || !existsSync(path.join(sdkDist, 'index.js'))) {
	console.error(
		'The plugin SDK is not built; run `pnpm --filter @pouchbasejs/plugin-sdk build` first.'
	);
	process.exit(1);
}

const { DEFAULT_REGISTRY_URL, createRegistryClient } = await import(
	pathToFileURL(path.join(sdkDist, 'index.js')).href
);

// Empty values count as unset: GitHub Actions passes an undefined secret or variable as ''.
const registry = process.env.POUCHBASE_REGISTRY_URL || DEFAULT_REGISTRY_URL;
const token = process.env.POUCHBASE_REGISTRY_TOKEN || undefined;

if (!token && !dryRun) {
	console.warn(
		'::warning::POUCHBASE_REGISTRY_TOKEN is not set; the first-party plugins are not published.'
	);
	process.exit(0);
}

const client = createRegistryClient({ url: registry });
const failed = [];
let pending = 0;

console.log(`Registry: ${registry}${dryRun ? ' (dry run)' : ''}`);

for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
	const dir = path.join(pluginsDir, entry.name);

	if (!entry.isDirectory() || !existsSync(path.join(dir, 'pouchbase-plugin.json'))) {
		continue;
	}

	const manifest = JSON.parse(readFileSync(path.join(dir, 'pouchbase-plugin.json'), 'utf8'));
	const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
	const id = `${manifest.id}@${pkg.version}`;

	try {
		if (await client.getVersion(manifest.id, pkg.version)) {
			console.log(`${id} is already published.`);
			continue;
		}
	} catch (error) {
		console.error(`Could not check ${id}: ${error.message}`);
		failed.push(id);
		continue;
	}

	pending += 1;

	if (dryRun) {
		console.log(`${id} would be published.`);
		continue;
	}

	try {
		execFileSync(process.execPath, [cli, 'publish', '--registry', registry], {
			cwd: dir,
			stdio: 'inherit',
			env: { ...process.env, POUCHBASE_REGISTRY_TOKEN: token }
		});
	} catch {
		failed.push(id);
	}
}

if (failed.length > 0) {
	console.error(`Failed to ${dryRun ? 'check' : 'publish'}: ${failed.join(', ')}`);
	process.exit(1);
}

if (pending === 0) {
	console.log('Every plugin is already published.');
}
