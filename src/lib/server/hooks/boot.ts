import type { Handle } from '@sveltejs/kit/hooks';

import { Services } from '../services/services';

export const boot: Handle = async ({ event, resolve }) => {
	event.locals.services = new Services();
	event.locals.user = null;

	return resolve(event);
};
