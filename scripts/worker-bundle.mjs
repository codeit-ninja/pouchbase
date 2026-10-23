/**
 * Makes the files with which a Worker updates itself to this release (see `src/lib/updates.ts`),
 * after `pnpm build`: `dist/worker/pouchbase-worker.json`, the manifest, and
 * `dist/worker/pouchbase-worker-files.json.gz`, the contents. `.github/workflows/release.yml`
 * attaches both to the release.
 *
 * The modules are what `wrangler deploy` would upload (`--dry-run --outdir`), and the Worker
 * settings come from `wrangler.jsonc`. Only the bindings the update can recreate on any account are
 * supported (assets, Durable Objects, plain variables); the update keeps every other binding of the
 * running Worker, such as its D1 databases and secrets.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

import { unstable_readConfig } from 'wrangler';

import pkg from '../package.json' with { type: 'json' };

const output = resolve('dist/worker');
const bundle = resolve('dist/worker/bundle');

const MODULE_TYPES = {
	'.js': 'application/javascript+module',
	'.mjs': 'application/javascript+module',
	'.cjs': 'application/javascript',
	'.wasm': 'application/wasm',
	'.txt': 'text/plain',
	'.bin': 'application/octet-stream'
};

/** Content types the assets are served with; `application/null` serves a file without one. */
const ASSET_TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.map': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.xml': 'application/xml',
	'.txt': 'text/plain',
	'.md': 'text/markdown',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.wasm': 'application/wasm'
};

/** Bindings that point at resources of one account, which the release can't bring along. */
const UNSUPPORTED_BINDINGS = [
	'kv_namespaces',
	'd1_databases',
	'r2_buckets',
	'services',
	'queues',
	'vectorize',
	'hyperdrive',
	'analytics_engine_datasets',
	'workflows',
	'send_email',
	'secrets_store_secrets'
];

function sha256(data) {
	return createHash('sha256').update(data).digest('hex');
}

function files(directory) {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));
}

/** `.assetsignore` patterns (gitignore-like; `*` wildcards) as a test on a relative path. */
function ignored(directory) {
	const file = join(directory, '.assetsignore');
	const patterns = existsSync(file)
		? readFileSync(file, 'utf8')
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith('#'))
		: [];
	const expressions = ['.assetsignore', '.DS_Store', 'node_modules', '.git', ...patterns].map(
		(pattern) =>
			new RegExp(
				`(^|/)${pattern
					.replace(/^\//, '')
					.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
					.replace(/\*/g, '[^/]*')}(/|$)`
			)
	);

	return (path) => expressions.some((expression) => expression.test(path));
}

const config = unstable_readConfig({ config: 'wrangler.jsonc' });

/** Whether a config value configures something: `queues` is `{ producers: [], consumers: [] }` when unused. */
function used(value) {
	if (Array.isArray(value)) {
		return value.length > 0;
	}

	if (value && typeof value === 'object') {
		return Object.values(value).some(used);
	}

	return Boolean(value);
}

for (const key of UNSUPPORTED_BINDINGS) {
	if (used(config[key])) {
		throw new Error(
			`wrangler.jsonc has ${key}, which a self-update can't bring to another account`
		);
	}
}

rmSync(output, { recursive: true, force: true });
mkdirSync(bundle, { recursive: true });

execFileSync('wrangler', ['deploy', '--dry-run', '--outdir', bundle], {
	stdio: 'inherit',
	shell: process.platform === 'win32'
});

const mainModule = basename(config.main);
const modules = {};
const moduleList = [];

for (const path of files(bundle)) {
	const name = relative(bundle, path).split(sep).join('/');
	const type = MODULE_TYPES[extname(name)];

	if (!type) {
		// Source maps and the README that Wrangler writes next to the bundle.
		continue;
	}

	const data = readFileSync(path);

	modules[name] = data.toString('base64');
	moduleList.push({ name, type, size: data.length, sha256: sha256(data) });
}

if (!modules[mainModule]) {
	throw new Error(`The bundle has no ${mainModule}`);
}

const assetsDirectory = resolve(config.assets.directory);
const isIgnored = ignored(assetsDirectory);
const assetFiles = {};
const assetContents = {};

for (const path of files(assetsDirectory)) {
	const name = relative(assetsDirectory, path).split(sep).join('/');

	if (isIgnored(name)) {
		continue;
	}

	const data = readFileSync(path);
	const hash = sha256(data).slice(0, 32);
	const type = ASSET_TYPES[extname(name).toLowerCase()] ?? 'application/null';

	assetFiles[`/${name}`] = { hash, size: data.length, type };
	assetContents[hash] = { type, content: data.toString('base64') };
}

const assetsConfig = {};

for (const name of ['_headers', '_redirects']) {
	const path = join(assetsDirectory, name);

	if (existsSync(path)) {
		assetsConfig[name] = readFileSync(path, 'utf8');
	}
}

const bindings = [
	{ type: 'assets', name: config.assets.binding },
	...config.durable_objects.bindings.map((binding) => ({
		type: 'durable_object_namespace',
		name: binding.name,
		class_name: binding.class_name,
		...(binding.script_name && { script_name: binding.script_name })
	})),
	...Object.entries(config.vars ?? {}).map(([name, value]) =>
		typeof value === 'string'
			? { type: 'plain_text', name, text: value }
			: { type: 'json', name, json: value }
	)
];

const manifest = {
	format: 1,
	version: pkg.version,
	worker: {
		main_module: mainModule,
		compatibility_date: config.compatibility_date,
		compatibility_flags: config.compatibility_flags,
		bindings,
		migrations: config.migrations,
		crons: config.triggers?.crons ?? []
	},
	modules: moduleList,
	assets: { config: assetsConfig, files: assetFiles }
};

writeFileSync(join(output, 'pouchbase-worker.json'), JSON.stringify(manifest, null, '\t'));
writeFileSync(
	join(output, 'pouchbase-worker-files.json.gz'),
	gzipSync(JSON.stringify({ modules, assets: assetContents }), { level: 9 })
);
rmSync(bundle, { recursive: true, force: true });

console.log(
	`Wrote dist/worker for ${pkg.version}: ${moduleList.length} modules, ${Object.keys(assetFiles).length} assets`
);
