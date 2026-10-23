import type { RequestHandler } from './$types';

import { error } from '@sveltejs/kit';

/**
 * An export file of the collections in `?collections=a,b` (every collection without it), as a
 * download. Import it again from the Collections menu, also into another instance.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Not logged in');
	}

	const names = url.searchParams.get('collections')?.split(',').filter(Boolean);
	const result = await locals.services.collections().export(names);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	const date = result.value.exportedAt.slice(0, 10);

	return new Response(JSON.stringify(result.value, null, '\t'), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="collections-${date}.json"`,
			'Cache-Control': 'no-store'
		}
	});
};
