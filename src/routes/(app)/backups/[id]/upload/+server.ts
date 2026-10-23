import type { RequestHandler } from './$types';
import type { DatabaseFile } from '#lib/backups/archive.js';

import { error } from '@sveltejs/kit';

import { DATABASE_FILES, UPLOAD_PART_SIZE } from '#lib/backups/archive.js';

/**
 * One part of a database file of an uploaded backup, as the raw request body:
 * `PUT /backups/<id>/upload?file=app.sql&part=1&last=1`. The Backups page sends the files of an
 * archive in parts of `UPLOAD_PART_SIZE`, in order, so no request comes near the body size limit.
 */
export const PUT: RequestHandler = async ({ params, url, request, locals }) => {
	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const file = url.searchParams.get('file') as DatabaseFile;
	const part = Number(url.searchParams.get('part'));
	const last = url.searchParams.get('last') === '1';

	if (!DATABASE_FILES.includes(file) || !Number.isInteger(part) || part < 1 || part > 10000) {
		error(400, 'Invalid file or part');
	}

	const body = new Uint8Array(await request.arrayBuffer());

	if (body.byteLength > UPLOAD_PART_SIZE) {
		error(413, 'Part too large');
	}

	const result = await locals.services.backups().uploadPart(params.id, file, part, body, last);

	if (result.isErr()) {
		if (result.error.code === 16004) {
			error(404, 'Backup not found');
		}

		if (result.error.code === 16011) {
			error(409, 'This upload is no longer active; start it again');
		}

		if (result.error.code === 16012) {
			error(502, `Could not upload to the destination: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	return new Response(null, { status: 204 });
};
