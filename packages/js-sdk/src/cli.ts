#!/usr/bin/env node
/**
 * The `pouchbase` command (Node only; the rest of the SDK runs everywhere):
 *
 * ```sh
 * pouchbase types <url> [--out src/pouchbase.ts]
 * ```
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { PouchbaseError } from './error.js';
import { fetchTypes } from './typegen.js';

const USAGE = `Usage: pouchbase types [url] [--out <file>]

Downloads the TypeScript types of your collections. Copy the URL from the Types page of the
Pouchbase admin, or set POUCHBASE_TYPES_URL.

Options:
  -o, --out <file>  Write the types to this file instead of printing them
  -h, --help        Show this help`;

/** Runs the command line; returns the exit code. */
async function main(argv: string[]): Promise<number> {
	let parsed;

	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: true,
			options: {
				out: { type: 'string', short: 'o' },
				help: { type: 'boolean', short: 'h' }
			}
		});
	} catch (error) {
		console.error(`${(error as Error).message}\n\n${USAGE}`);

		return 1;
	}

	const [command, positionalUrl] = parsed.positionals;

	if (parsed.values.help || !command) {
		console.log(USAGE);

		return parsed.values.help ? 0 : 1;
	}

	if (command !== 'types') {
		console.error(`Unknown command: ${command}\n\n${USAGE}`);

		return 1;
	}

	const url = positionalUrl ?? process.env.POUCHBASE_TYPES_URL;

	if (!url) {
		console.error(`Pass the URL from the Types page, or set POUCHBASE_TYPES_URL.\n\n${USAGE}`);

		return 1;
	}

	let code: string;

	try {
		code = await fetchTypes(url);
	} catch (error) {
		const status = error instanceof PouchbaseError && error.status ? ` (${error.status})` : '';

		console.error(`Could not download the types${status}: ${(error as Error).message}`);

		return 1;
	}

	if (!parsed.values.out) {
		process.stdout.write(code);

		return 0;
	}

	const file = resolve(parsed.values.out);

	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, code);
	console.error(`Wrote the types to ${parsed.values.out}`);

	return 0;
}

process.exitCode = await main(process.argv.slice(2));
