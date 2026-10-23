import type { RequestHandler } from './$types';

import { isInlineImage } from '#lib/files/files.js';
import { json, preflight } from '#lib/server/api.js';

/**
 * Serves a file of the built-in `files` collection, or one of its thumbnails
 * (`?thumb=100x100`, only for sizes configured in the collection's settings; otherwise the
 * original is served). File ids are random, so URLs can't be guessed; files are
 * public.
 *
 * Files are served from the admin's own origin, so only safe image types are shown inline; all
 * other types (HTML, SVG, ...) are downloads and can't run scripts.
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	const result = await locals.services.files().open(params.id, url.searchParams.get('thumb'));

	if (result.isErr()) {
		return json({ message: 'Could not load the file' }, 500);
	}

	if (!result.value) {
		return json({ message: 'File not found' }, 404);
	}

	const { file, mimeType, size, body } = result.value;
	const inline = isInlineImage(mimeType) && !url.searchParams.has('download');
	const filename = encodeURIComponent(file.name);
	const headers: Record<string, string> = {
		'Content-Type': inline ? mimeType : 'application/octet-stream',
		'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
		'Cache-Control': 'public, max-age=3600',
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox",
		'Access-Control-Allow-Origin': '*'
	};

	if (size) {
		headers['Content-Length'] = String(size);
	}

	return new Response(body as BodyInit, { headers });
};

export const OPTIONS: RequestHandler = preflight;
