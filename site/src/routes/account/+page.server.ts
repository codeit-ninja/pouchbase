import type { PageServerLoad } from './$types';

import { requireUser } from '#lib/server/session.js';

/** The account page is for signed-in users only. */
export const load: PageServerLoad = async () => {
	await requireUser();
};
