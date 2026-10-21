import type { Handle } from '@sveltejs/kit/hooks';

import { error, redirect } from '@sveltejs/kit';

const PUBLIC_ROUTES = ['/login'];

/**
 * Sends every request to the install wizard until it's done, and to `/login` when logged out.
 * The public API (`/api/...`) is used by client apps and has its own authentication.
 */
export const guard: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const { services } = event.locals;

	const result = await services.install().getState();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	// Installations created by an older version may have pending migrations and miss the
	// built-in collections. Both are cached per isolate after the first request.
	if (result.value === 'done') {
		const ready = await services
			.database()
			.migrate()
			.andThen(() => services.auth().ensureUsersCollection());

		if (ready.isErr()) {
			error(500, ready.error.message);
		}
	}

	// Remote functions and assets (`/_app/...`) handle their own access.
	if (pathname.startsWith('/_app/')) {
		return resolve(event);
	}

	if (pathname.startsWith('/api/')) {
		if (result.value !== 'done') {
			error(503, 'Pouchbase is not installed yet');
		}

		return resolve(event);
	}

	const isInstallRoute = pathname === '/install' || pathname.startsWith('/install/');

	if (result.value !== 'done') {
		if (!isInstallRoute) {
			redirect(303, '/install');
		}

		return resolve(event);
	}

	if (isInstallRoute) {
		redirect(303, '/');
	}

	const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

	if (!event.locals.user && !isPublicRoute) {
		redirect(303, '/login');
	}

	if (event.locals.user && isPublicRoute) {
		redirect(303, '/');
	}

	return resolve(event);
};
