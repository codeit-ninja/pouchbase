import type { Handle } from '@sveltejs/kit/hooks';

import { error, redirect } from '@sveltejs/kit';

const PUBLIC_ROUTES = ['/login'];

/** Pages app users open from an email link (password reset, verification), signed in or not. */
const ACCOUNT_ROUTES = ['/account/reset-password', '/account/verify-email'];

/**
 * Sends every request to the install wizard until it's done, and to `/login` when logged out.
 * The public API (`/api/...`) is used by client apps and has its own authentication.
 */
export const guard: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	const { services } = event.locals;

	// The health check (Docker, load balancers) answers even when the databases are unreachable.
	if (pathname === '/api/health') {
		return resolve(event);
	}

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

		// Gives the Worker D1 bindings when it has none yet (right after installing, or after a
		// deploy replaced them). Queries use the REST API until then, so this runs in the background.
		const attached = services
			.database()
			.attach()
			.mapErr((failure) => {
				console.error('[pouchbase] Could not add D1 bindings', failure);
			});

		event.platform?.ctx?.waitUntil(Promise.resolve(attached));
	}

	// Remote functions and assets (`/_app/...`) handle their own access.
	if (pathname.startsWith('/_app/')) {
		return resolve(event);
	}

	// `/internal/tick` (scheduled work) checks its own token.
	if (pathname.startsWith('/api/') || pathname.startsWith('/internal/')) {
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

	if (ACCOUNT_ROUTES.includes(pathname)) {
		return resolve(event);
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
