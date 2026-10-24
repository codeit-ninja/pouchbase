import { z } from 'zod';

import { manifestSchema, UI_DIR, type ManifestIssue, type PluginManifest } from './manifest.js';

/**
 * A built plugin, as published to the registry and installed by a host: one JSON document with the
 * manifest and every file the host needs. `pouchbase-plugin build` creates it.
 *
 * - The server code is bundled into a single ES module, `server.js`, with no imports left.
 * - UI files stay source: the host compiles the `.svelte` files with its own Svelte compiler on
 *   install, so they always match the Svelte version of the dashboard. TypeScript modules in `ui/`
 *   are already turned into JavaScript, so the bundle only has `.svelte`, `.js`, `.css`, `.json`
 *   and `.svg` files there.
 */

export const BUNDLE_FORMAT = 'pouchbase-plugin-bundle';

/** Version of the bundle layout itself; changes only with the API version. */
export const BUNDLE_VERSION = 1;

/** Largest bundle a host installs, in bytes. */
export const MAX_BUNDLE_SIZE = 1024 * 1024;

/** Path of the server code in a bundle. */
export const SERVER_FILE = 'server.js';

/**
 * Imports left in the server code: static imports and re-exports with a specifier, and dynamic
 * `import()`. `pouchbase-plugin build` never leaves any, so a bundle that has them was built by hand,
 * e.g. to reach `cloudflare:sockets` or `cloudflare:workers` past the network allowlist.
 */
const SERVER_IMPORT = /\bimport\s*\(|\bimport\s*["'`]|\b(?:import|export)\b[^;"'`]*?\bfrom\s*["'`]/;

/** Problems with the server code of a bundle: it must be one ES module without imports. */
export function serverCodeIssues(code: string): ManifestIssue[] {
	return SERVER_IMPORT.test(code)
		? [{ path: `files.${SERVER_FILE}`, message: 'The server code must not import other modules' }]
		: [];
}

/** File types allowed in the `ui/` directory of a bundle. */
const UI_FILE = /\.(?:svelte|js|css|json|svg)$/;

export const bundleSchema = z
	.object({
		format: z.literal(BUNDLE_FORMAT),
		bundleVersion: z.literal(BUNDLE_VERSION),
		manifest: manifestSchema,
		/** Path → contents. */
		files: z.record(z.string(), z.string())
	})
	.superRefine((bundle, ctx) => {
		const { manifest, files } = bundle;

		for (const path of Object.keys(files)) {
			const allowed =
				path === SERVER_FILE ||
				(path.startsWith(`${UI_DIR}/`) && !path.split('/').includes('..') && UI_FILE.test(path));

			if (!allowed) {
				ctx.addIssue({ code: 'custom', path: ['files', path], message: 'File not allowed' });
			}
		}

		const server = files[SERVER_FILE];

		if (server !== undefined) {
			for (const issue of serverCodeIssues(server)) {
				ctx.addIssue({ code: 'custom', path: ['files', SERVER_FILE], message: issue.message });
			}
		}

		if (manifest.server !== undefined && manifest.server !== SERVER_FILE) {
			ctx.addIssue({
				code: 'custom',
				path: ['manifest', 'server'],
				message: `Must be ${SERVER_FILE} in a bundle`
			});
		}

		const required = [
			...(manifest.server ? [manifest.server] : []),
			...manifest.contributes.fields.flatMap((field) => [field.input, field.cell ?? []].flat()),
			...manifest.contributes.pages.map((page) => page.component),
			...manifest.contributes.authProviders.flatMap((provider) => provider.icon ?? [])
		];

		for (const path of required) {
			if (!(path in files)) {
				ctx.addIssue({ code: 'custom', path: ['files'], message: `Missing file: ${path}` });
			}
		}
	});

export type PluginBundle = {
	format: typeof BUNDLE_FORMAT;
	bundleVersion: typeof BUNDLE_VERSION;
	manifest: PluginManifest;
	files: Record<string, string>;
};

export type BundleResult =
	{ success: true; bundle: PluginBundle } | { success: false; issues: ManifestIssue[] };

/** Reads and validates the bytes of a bundle. */
export function parseBundle(bytes: Uint8Array): BundleResult {
	if (bytes.byteLength > MAX_BUNDLE_SIZE) {
		return {
			success: false,
			issues: [{ path: '', message: `Larger than ${MAX_BUNDLE_SIZE / 1024} KiB` }]
		};
	}

	let json: unknown;

	try {
		json = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return { success: false, issues: [{ path: '', message: 'Not valid JSON' }] };
	}

	const result = bundleSchema.safeParse(json);

	if (!result.success) {
		return {
			success: false,
			issues: result.error.issues.map((issue) => ({
				path: issue.path.join('.'),
				message: issue.message
			}))
		};
	}

	return { success: true, bundle: result.data };
}

/** The bytes of a bundle, as stored and published. */
export function serializeBundle(bundle: PluginBundle): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(JSON.stringify(bundle));
}

function base64(bytes: Uint8Array) {
	let binary = '';

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

/**
 * Subresource Integrity string of a bundle, e.g. `sha256-47DEQpj8…`. The registry lists it with
 * every version, and a host refuses a download that doesn't match.
 */
export async function computeIntegrity(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes);

	return `sha256-${base64(new Uint8Array(digest))}`;
}

export async function verifyIntegrity(
	bytes: Uint8Array<ArrayBuffer>,
	integrity: string
): Promise<boolean> {
	return (await computeIntegrity(bytes)) === integrity;
}
