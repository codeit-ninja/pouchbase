/** Name of the built-in collection that holds uploaded files. */
export const FILES_COLLECTION = 'files';

/** Columns of `files` that only the files service writes; they aren't editable in forms. */
export const MANAGED_FILE_FIELDS = new Set(['mime_type', 'size', 'key', 'thumbnails']);

/** Largest upload accepted, in bytes. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Image types that are safe to show inline. Everything else (including SVG and HTML, which can
 * run scripts) is served as a download.
 */
const INLINE_IMAGE_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/avif'
]);

export function isInlineImage(mimeType: string | null | undefined) {
	return !!mimeType && INLINE_IMAGE_TYPES.has(mimeType.toLowerCase());
}

/** Images the server can edit and make thumbnails of. */
const EDITABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function isEditableImage(mimeType: string | null | undefined) {
	return !!mimeType && EDITABLE_IMAGE_TYPES.has(mimeType.toLowerCase());
}

/**
 * Public URL of a file.
 *
 * @param options.thumb A configured thumbnail size, e.g. `100x100`.
 * @param options.version Changes the URL when the file changes (e.g. `updated_at`), so browsers
 *   don't show a cached old version after an edit.
 * @param options.download Serve as a download.
 */
export function fileUrl(
	id: string,
	options: { thumb?: string | null; version?: string | number; download?: boolean } = {}
) {
	const search = new URLSearchParams();

	if (options.thumb) {
		search.set('thumb', options.thumb);
	}

	if (options.version !== undefined) {
		search.set('v', String(options.version));
	}

	if (options.download) {
		search.set('download', '');
	}

	const query = search.toString();

	return `/api/files/${encodeURIComponent(id)}${query ? `?${query}` : ''}`;
}

export function formatFileSize(bytes: number) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
