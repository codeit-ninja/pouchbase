/**
 * Starts the development instance of the plugin registry: the Node build of Pouchbase as its own
 * instance (`registry-dev` by default), next to the one `pnpm dev:app` runs. The site's dev server
 * (`pnpm dev:site`) talks to it when `site/.env.development.local` points at it; see README.md.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = fileURLToPath(new URL('../server.mjs', import.meta.url));
const handler = fileURLToPath(new URL('../build/handler.js', import.meta.url));

if (!existsSync('.env')) {
	// `pnpm dev` starts every `dev:` script, so this stays quiet for people who don't need it.
	console.log('[registry] No registry/.env; copy registry/.env.example to start the dev registry.');
	process.exit(0);
}

process.loadEnvFile('.env');
process.env.POUCHBASE_INSTANCE ||= 'registry-dev';
process.env.PORT ||= '5175';
process.env.ORIGIN ||= `http://localhost:${process.env.PORT}`;

if (!existsSync(handler) || process.argv.includes('--build')) {
	console.log('[registry] Building the Node version of Pouchbase…');

	const build = spawnSync('pnpm', ['build:node'], { cwd: root, stdio: 'inherit', shell: true });

	if (build.status !== 0) {
		process.exit(build.status ?? 1);
	}
}

console.log(
	`[registry] ${process.env.POUCHBASE_INSTANCE} on ${process.env.ORIGIN} (the registry API is the site: http://localhost:5174/v1)`
);

const child = spawn(process.execPath, [server], { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => child.kill(signal));
}

child.on('exit', (code) => process.exit(code ?? 0));
