import type { RequestHandler } from './$types';

import { error } from '@sveltejs/kit';

/**
 * A completed backup as a tar archive (`manifest.json`, `system.sql` and `app.sql`), streamed from
 * its destination. Upload it again on the Backups page to restore it, also into another
 * installation.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const result = await locals.services.backups().archive(params.id);

	if (result.isErr()) {
		if (result.error.code === 16005) {
			error(409, 'Only completed backups can be downloaded');
		}

		if (result.error.code === 16012) {
			error(502, `Could not read the backup: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	if (!result.value) {
		error(404, 'Backup not found');
	}

	const { filename, size, body } = result.value;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/x-tar',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Content-Length': String(size),
			'Cache-Control': 'no-store'
		}
	});
};
