/**
 * Which uploads a file field accepts. A field stores a list of rules in the format of an `<input
 * accept>` attribute: MIME types (`application/pdf`), wildcards (`image/*`) and extensions (`.zip`).
 * An empty list accepts every file. Shared by the form (file input) and the server (upload check),
 * so both apply the same rules.
 */

import { MAX_FILE_SIZE } from './files';

/** Common groups of file types to pick from, so nobody has to know the MIME types. */
export const FILE_TYPE_PRESETS = {
	images: { label: 'Images', rules: ['image/*'] },
	videos: { label: 'Videos', rules: ['video/*'] },
	audio: { label: 'Audio', rules: ['audio/*'] },
	pdf: { label: 'PDF', rules: ['application/pdf'] },
	documents: {
		label: 'Documents',
		rules: [
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/vnd.ms-excel',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'application/vnd.ms-powerpoint',
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			'application/vnd.oasis.opendocument.text',
			'application/vnd.oasis.opendocument.spreadsheet',
			'application/vnd.oasis.opendocument.presentation',
			'application/rtf',
			'text/plain',
			'text/csv'
		]
	},
	archives: {
		label: 'Archives',
		rules: [
			'application/zip',
			'application/x-7z-compressed',
			'application/gzip',
			'application/x-tar',
			'application/vnd.rar'
		]
	}
} as const satisfies Record<string, { label: string; rules: readonly string[] }>;

export type FileTypePreset = keyof typeof FILE_TYPE_PRESETS;

export const FILE_TYPE_PRESET_IDS = Object.keys(FILE_TYPE_PRESETS) as [
	FileTypePreset,
	...FileTypePreset[]
];

const MIME_RULE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/(\*|[a-z0-9][a-z0-9!#$&^_.+-]*)$/;
const EXTENSION_RULE = /^\.[a-z0-9][a-z0-9_-]*$/;

function isRule(rule: string) {
	return MIME_RULE.test(rule) || EXTENSION_RULE.test(rule);
}

/**
 * Parses custom types as typed by an admin, separated by commas or spaces, e.g.
 * `application/json, .md`.
 */
export function parseFileTypes(text: string): { rules: string[]; invalid: string[] } {
	const parts = text
		.split(/[\s,]+/)
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);

	return {
		rules: [...new Set(parts.filter(isRule))],
		invalid: parts.filter((part) => !isRule(part))
	};
}

/**
 * The accept rules of a field's options. Also reads the values of the first version of file
 * fields: `'images'` (only images) and `'any'`.
 */
export function acceptRules(accept: unknown): string[] {
	if (accept === 'images') {
		return ['image/*'];
	}

	if (!Array.isArray(accept)) {
		return [];
	}

	return accept.map((rule) => String(rule).toLowerCase()).filter(isRule);
}

/** Whether a file with this name and MIME type matches the rules; an empty list matches all. */
export function matchesFileTypes(rules: string[], file: { name: string; type: string }) {
	if (!rules.length) {
		return true;
	}

	const name = file.name.toLowerCase();
	const type = file.type.toLowerCase();

	return rules.some((rule) => {
		if (rule.startsWith('.')) {
			return name.endsWith(rule);
		}

		if (rule.endsWith('/*')) {
			return type.startsWith(rule.slice(0, -1));
		}

		return type === rule;
	});
}

/** The rules split into the presets they fully contain and the remaining custom rules. */
export function splitFileTypes(rules: string[]): { presets: FileTypePreset[]; custom: string[] } {
	const remaining = new Set(rules);
	const presets: FileTypePreset[] = [];

	for (const id of FILE_TYPE_PRESET_IDS) {
		const preset: readonly string[] = FILE_TYPE_PRESETS[id].rules;

		if (preset.every((rule) => remaining.has(rule))) {
			presets.push(id);
			preset.forEach((rule) => remaining.delete(rule));
		}
	}

	return { presets, custom: [...remaining] };
}

/** Short description of the rules, e.g. `Images, PDF, .md`; `Any file` for an empty list. */
export function describeFileTypes(rules: string[]) {
	if (!rules.length) {
		return 'Any file';
	}

	const { presets, custom } = splitFileTypes(rules);

	return [...presets.map((id) => FILE_TYPE_PRESETS[id].label), ...custom].join(', ');
}

/** What a file field accepts: its type rules and its size limit, capped at `MAX_FILE_SIZE`. */
export function fileFieldRules(options: { accept?: unknown; maxSize?: unknown }) {
	const maxSize =
		typeof options.maxSize === 'number' && options.maxSize > 0
			? Math.min(options.maxSize, MAX_FILE_SIZE)
			: MAX_FILE_SIZE;

	return { accept: acceptRules(options.accept), maxSize };
}
