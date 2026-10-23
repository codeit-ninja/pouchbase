#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';

import { computeIntegrity } from '../bundle.js';
import { DEFAULT_REGISTRY_URL, createRegistryClient } from '../registry.js';
import { startDevServer } from './dev-server.js';
import { initProject } from './init.js';
import { printError } from './output.js';
import { buildBundle, bundleFileName } from './project.js';

const HELP = `Usage: pouchbase-plugin <command> [options]

Commands:
  init <dir>   Create a plugin in a new directory; its name becomes the plugin id
  validate     Check pouchbase-plugin.json and the files it points to
  build        Build the bundle into dist/
  dev          Rebuild on every change and serve the plugin from a local registry
  publish      Build and publish the bundle to the registry

Options:
  --port <n>         Port of the dev registry (default 4510)
  --registry <url>   Registry to publish to (default $POUCHBASE_REGISTRY_URL or ${DEFAULT_REGISTRY_URL})
  --token <token>    Publish token (default $POUCHBASE_REGISTRY_TOKEN)
  -h, --help         Show this help
`;

async function main() {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			port: { type: 'string', default: '4510' },
			registry: { type: 'string' },
			token: { type: 'string' },
			help: { type: 'boolean', short: 'h' }
		}
	});
	const [command, target] = positionals;
	const root = process.cwd();

	if (values.help || !command) {
		console.log(HELP);
		return;
	}

	switch (command) {
		case 'init': {
			if (!target) {
				throw new Error('Usage: pouchbase-plugin init <dir>');
			}

			const { root: created, id } = await initProject(target);
			console.log(`✓ Created ${id} in ${relative(root, created) || '.'}`);
			console.log('  Next: install the dependencies and run the dev command.');
			break;
		}

		case 'validate': {
			const { bundle } = await buildBundle(root);
			console.log(`✓ ${bundle.manifest.id}@${bundle.manifest.version} is valid`);
			break;
		}

		case 'build': {
			const { bundle, bytes } = await buildBundle(root);
			const file = join(root, 'dist', bundleFileName(bundle.manifest));

			await mkdir(join(root, 'dist'), { recursive: true });
			await writeFile(file, bytes);
			console.log(`✓ ${relative(root, file)} (${Math.ceil(bytes.byteLength / 1024)} KiB)`);
			console.log(`  ${await computeIntegrity(bytes)}`);
			break;
		}

		case 'dev':
			await startDevServer(root, Number(values.port));
			break;

		case 'publish': {
			const { bundle, bytes } = await buildBundle(root);
			const client = createRegistryClient({
				url: values.registry ?? process.env.POUCHBASE_REGISTRY_URL,
				token: values.token ?? process.env.POUCHBASE_REGISTRY_TOKEN
			});
			const version = await client.publish(bundle.manifest.id, bytes);
			console.log(`✓ Published ${bundle.manifest.id}@${version.version}`);
			break;
		}

		default:
			throw new Error(`Unknown command: ${command}\n\n${HELP}`);
	}
}

main().catch((error: unknown) => {
	printError(error);
	process.exitCode = 1;
});
