import type { ManifestIssue } from '../manifest.js';

import { RegistryError } from '../registry.js';
import { ProjectError } from './project.js';

/** Prints an error with its issues, one per line. */
export function printError(error: unknown) {
	if (error instanceof ProjectError || error instanceof RegistryError) {
		console.error(`✗ ${error.message}`);

		for (const issue of error.issues) {
			console.error(`  ${issue.path ? `${issue.path}: ` : ''}${issue.message}`);
		}

		return;
	}

	console.error(error instanceof Error ? `✗ ${error.message}` : error);
}

/** Prints problems that don't stop a build, one per line. */
export function printWarnings(warnings: readonly ManifestIssue[]) {
	for (const warning of warnings) {
		console.warn(`! ${warning.path ? `${warning.path}: ` : ''}${warning.message}`);
	}
}
