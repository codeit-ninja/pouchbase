import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { PLUGIN_ID_PATTERN } from '../manifest.js';
import { ProjectError } from './project.js';
import {
	TEMPLATES,
	TEMPLATE_DESCRIPTIONS,
	isTemplate,
	projectFiles,
	type PluginTemplate
} from './templates.js';

/** `pouchbase-plugin init`: a new plugin from one of the templates. */

export const DEFAULT_TEMPLATE: PluginTemplate = 'field';

/** The SDK's own version: `dist/cli.js` sits one level below `package.json`, `src/cli/` two. */
async function sdkVersion() {
	for (const path of ['../package.json', '../../package.json']) {
		try {
			const json = await readFile(new URL(path, import.meta.url), 'utf8');
			const pkg = JSON.parse(json) as { name?: string; version?: string };

			if (pkg.name === '@pouchbasejs/plugin-sdk' && pkg.version) {
				return pkg.version;
			}
		} catch {
			// Try the next one.
		}
	}

	throw new ProjectError("Can't find the version of @pouchbasejs/plugin-sdk");
}

/** The template named by `--template`; an error lists the others. */
export function parseTemplate(value: string): PluginTemplate {
	if (!isTemplate(value)) {
		throw new ProjectError(`Unknown template: ${value}; use one of ${TEMPLATES.join(', ')}`);
	}

	return value;
}

/**
 * Asks which template to use. Only in a terminal: without one (CI, scripts, tests) it returns
 * the default right away, so it never waits for input.
 */
export async function askTemplate(
	input: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin,
	output: NodeJS.WritableStream & { isTTY?: boolean } = process.stdout
): Promise<PluginTemplate> {
	if (!input.isTTY || !output.isTTY) {
		return DEFAULT_TEMPLATE;
	}

	const lines = TEMPLATES.map(
		(template, index) => `  ${index + 1}. ${template.padEnd(14)} ${TEMPLATE_DESCRIPTIONS[template]}`
	);
	const prompt = createInterface({ input, output });

	try {
		output.write(`Templates:\n${lines.join('\n')}\n`);

		for (;;) {
			const answer = (
				await prompt.question(`Template (1-${TEMPLATES.length}, default 1): `)
			).trim();

			if (!answer) {
				return DEFAULT_TEMPLATE;
			}

			const byNumber = TEMPLATES[Number(answer) - 1];

			if (byNumber) {
				return byNumber;
			}

			if (isTemplate(answer)) {
				return answer;
			}

			output.write(`  Enter a number from 1 to ${TEMPLATES.length} or a template name.\n`);
		}
	} finally {
		prompt.close();
	}
}

export async function initProject(
	target: string,
	{ template = DEFAULT_TEMPLATE }: { template?: PluginTemplate } = {}
) {
	const root = resolve(target);
	const id = basename(root);

	if (!PLUGIN_ID_PATTERN.test(id) || id.length < 3) {
		throw new ProjectError(
			`"${id}" can't be a plugin id; use a directory name of lowercase words separated by dashes, e.g. color-picker`
		);
	}

	const existing = await readdir(root).catch(() => []);

	if (existing.length) {
		throw new ProjectError(`${root} is not empty`);
	}

	const files = projectFiles(id, template, await sdkVersion());

	for (const [path, contents] of Object.entries(files)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), contents.endsWith('\n') ? contents : `${contents}\n`);
	}

	return { root, id, template, files: Object.keys(files) };
}
