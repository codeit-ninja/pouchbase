#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';

import { computeIntegrity } from '../bundle.js';
import { manifestJsonSchema } from '../manifest.js';
import { DEFAULT_REGISTRY_URL, createRegistryClient } from '../registry.js';
import { CONTRIBUTION_KINDS, addContribution, isContributionKind } from './add.js';
import { startDevServer } from './dev-server.js';
import { askTemplate, initProject, parseTemplate } from './init.js';
import { printError, printWarnings } from './output.js';
import { buildBundle, bundleFileName } from './project.js';
import { TEMPLATES } from './templates.js';

const HELP = `Usage: pouchbase-plugin <command> [options]

Commands:
  init <dir>             Create a plugin in a new directory; its name becomes the plugin id
  add <kind> <id>        Add a field, page or auth-provider to the plugin, with its files
  validate               Check pouchbase-plugin.json, the files it points to and the server code
  build                  Build the bundle into dist/
  dev                    Rebuild on every change and serve the plugin from a local registry
  publish                Build and publish the bundle to the registry
  schema                 Print the JSON Schema of pouchbase-plugin.json

Options:
  --template <name>  Template for init: ${TEMPLATES.join(', ')} (asks in a terminal; default field)
  --port <n>         Port of the dev registry (default 4510)
  --exact-version    Let dev serve the manifest's version instead of <version>-dev.<n>
  --registry <url>   Registry to publish to (default $POUCHBASE_REGISTRY_URL or ${DEFAULT_REGISTRY_URL})
  --token <token>    Publish token (default $POUCHBASE_REGISTRY_TOKEN)
  -h, --help         Show this help
`;

async function main() {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			template: { type: 'string' },
			port: { type: 'string', default: '4510' },
			'exact-version': { type: 'boolean' },
			registry: { type: 'string' },
			token: { type: 'string' },
			help: { type: 'boolean', short: 'h' }
		}
	});
	const [command, target, name] = positionals;
	const root = process.cwd();

	if (values.help || !command) {
		console.log(HELP);
		return;
	}

	switch (command) {
		case 'init': {
			if (!target) {
				throw new Error('Usage: pouchbase-plugin init <dir> [--template <name>]');
			}

			// Check the flag before asking anything.
			const template = values.template ? parseTemplate(values.template) : await askTemplate();
			const { root: created, id } = await initProject(target, { template });
			console.log(`✓ Created ${id} in ${relative(root, created) || '.'} (${template} template)`);
			console.log('  Next: install the dependencies and run the dev command.');
			break;
		}

		case 'add': {
			if (!target || !name || !isContributionKind(target)) {
				throw new Error(
					`Usage: pouchbase-plugin add <${CONTRIBUTION_KINDS.join('|')}> <id>, e.g. add field rating`
				);
			}

			const { created, hints } = await addContribution(root, target, name);
			console.log(`✓ Added ${target} ${name}`);

			for (const file of created) {
				console.log(`  Created ${file}`);
			}

			for (const hint of hints) {
				console.log(`  Next: ${hint}`);
			}

			break;
		}

		case 'validate': {
			const { bundle, warnings } = await buildBundle(root);
			printWarnings(warnings);
			console.log(`✓ ${bundle.manifest.id}@${bundle.manifest.version} is valid`);
			break;
		}

		case 'build': {
			const { bundle, bytes, warnings } = await buildBundle(root);
			const file = join(root, 'dist', bundleFileName(bundle.manifest));

			printWarnings(warnings);
			await mkdir(join(root, 'dist'), { recursive: true });
			await writeFile(file, bytes);
			console.log(`✓ ${relative(root, file)} (${Math.ceil(bytes.byteLength / 1024)} KiB)`);
			console.log(`  ${await computeIntegrity(bytes)}`);
			break;
		}

		case 'dev':
			await startDevServer(root, Number(values.port), {
				exactVersion: values['exact-version'] ?? false
			});
			break;

		case 'publish': {
			const { bundle, bytes, warnings } = await buildBundle(root);
			printWarnings(warnings);
			const client = createRegistryClient({
				url: values.registry ?? process.env.POUCHBASE_REGISTRY_URL,
				token: values.token ?? process.env.POUCHBASE_REGISTRY_TOKEN
			});
			const version = await client.publish(bundle.manifest.id, bytes);
			console.log(`✓ Published ${bundle.manifest.id}@${version.version}`);
			break;
		}

		case 'schema':
			console.log(JSON.stringify(manifestJsonSchema(), null, '\t'));
			break;

		default:
			throw new Error(`Unknown command: ${command}\n\n${HELP}`);
	}
}

main().catch((error: unknown) => {
	printError(error);
	process.exitCode = 1;
});
