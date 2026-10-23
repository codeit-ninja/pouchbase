/**
 * Entry point of the Node target: `node server.mjs` after `pnpm build:node` (the Docker image runs
 * this), and of the single binary (`pnpm build:binary`, see `scripts/build-binary.mjs`), which
 * bundles this file with the build. It serves the SvelteKit handler from `build/handler.js` and adds
 * one thing the default `node build` server lacks since adapter-node 6: an `ORIGIN` variable with
 * the public URL of the instance. SvelteKit derives the origin from the `x-forwarded-*` headers of a
 * reverse proxy, so when `ORIGIN` is set this server fills those headers in itself; without it the
 * proxy's headers are used as they are. Without a proxy and without `ORIGIN`, `https` is assumed and
 * form submissions over plain http are rejected as cross-site.
 *
 * It also calls `POST /internal/tick` once a minute, which runs scheduled backups (the Worker uses a
 * Cron Trigger for this instead).
 *
 * Commands, like PocketBase: `serve` (the default) and `version`; `--help` lists the flags. Flags
 * override the environment, and a `.env` file in the working directory is read if there is one.
 *
 * Variables: ORIGIN, HOST (default 0.0.0.0), PORT (default 3000), SHUTDOWN_TIMEOUT (seconds,
 * default 30), plus the ones the handler reads itself (BODY_SIZE_LIMIT, ADDRESS_HEADER, ...) and the
 * app's own (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, ...).
 */
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';

import pkg from './package.json' with { type: 'json' };

const usage = `Pouchbase ${pkg.version}

Usage: pouchbase [command] [flags]

Commands:
  serve      Start the server (default)
  version    Print the version

Flags for serve:
  --http <host:port>   Address to listen on (default 0.0.0.0:3000, or HOST and PORT)
  --origin <url>       Public URL of this instance, used for redirects and OAuth callbacks (ORIGIN)
  --env-file <path>    Read environment variables from this file (default .env, if it exists)
  -h, --help           Show this help

The data lives on Cloudflare (D1 and R2): set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the
environment or in the env file.`;

const { values: flags, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		http: { type: 'string' },
		origin: { type: 'string' },
		'env-file': { type: 'string' },
		help: { type: 'boolean', short: 'h' },
		version: { type: 'boolean', short: 'v' }
	}
});

const command = positionals[0] ?? 'serve';

if (flags.help) {
	console.log(usage);
	process.exit(0);
}

if (flags.version || command === 'version') {
	console.log(pkg.version);
	process.exit(0);
}

if (command !== 'serve' || positionals.length > 1) {
	console.error(`Unknown command "${positionals.join(' ')}"\n\n${usage}`);
	process.exit(1);
}

const envFile = flags['env-file'] ?? (existsSync('.env') ? '.env' : null);

if (envFile) {
	process.loadEnvFile(envFile);
}

if (flags.http) {
	const separator = flags.http.lastIndexOf(':');

	if (separator === -1) {
		console.error(`Invalid --http "${flags.http}", expected <host:port>`);
		process.exit(1);
	}

	process.env.HOST = flags.http.slice(0, separator) || '0.0.0.0';
	process.env.PORT = flags.http.slice(separator + 1);
}

if (flags.origin) {
	process.env.ORIGIN = flags.origin;
}

const origin = process.env.ORIGIN ? new URL(process.env.ORIGIN) : null;
const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
const shutdownTimeout = Number(process.env.SHUTDOWN_TIMEOUT ?? 30) * 1000;

process.env.PROTOCOL_HEADER ??= 'x-forwarded-proto';
process.env.HOST_HEADER ??= 'x-forwarded-host';
process.env.PORT_HEADER ??= 'x-forwarded-port';

// Imported after the variables above are set, because the handler reads them when it loads.
const { handler } = await import('./build/handler.js');

const server = createServer((request, response) => {
	if (origin) {
		request.headers['x-forwarded-proto'] = origin.protocol.slice(0, -1);
		request.headers['x-forwarded-host'] = origin.host;
		delete request.headers['x-forwarded-port'];
	}

	handler(request, response);
});

server.listen(port, host, () => {
	console.log(`Listening on http://${host}:${port}${origin ? ` as ${origin.origin}` : ''}`);
});

/** Keep in sync with src/routes/internal/tick/+server.ts. */
async function tickToken(apiToken) {
	const data = new TextEncoder().encode(`pouchbase-tick:${apiToken}`);
	const digest = await crypto.subtle.digest('SHA-256', data);

	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Scheduled work (backups) runs once a minute, like the Cron Trigger of the Worker. A tick that
// is still running when the next one is due makes that one skip.
const tickHost =
	host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
let ticking = false;

const ticker = setInterval(async () => {
	if (ticking) {
		return;
	}

	ticking = true;

	try {
		const response = await fetch(`http://${tickHost}:${port}/internal/tick`, {
			method: 'POST',
			// JSON, so SvelteKit doesn't take it for a cross-site form submission.
			headers: {
				authorization: `Bearer ${await tickToken(process.env.CLOUDFLARE_API_TOKEN ?? '')}`,
				'content-type': 'application/json'
			},
			body: '{}'
		});

		// 503: not installed yet.
		if (!response.ok && response.status !== 503) {
			console.error(`[tick] ${response.status} ${await response.text()}`);
		}
	} catch (error) {
		console.error('[tick]', error);
	} finally {
		ticking = false;
	}
}, 60 * 1000);

ticker.unref();

function shutdown(signal) {
	console.log(`Received ${signal}, shutting down`);
	clearInterval(ticker);
	server.close(() => process.exit(0));
	server.closeIdleConnections();
	setTimeout(() => {
		server.closeAllConnections();
		process.exit(0);
	}, shutdownTimeout).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
