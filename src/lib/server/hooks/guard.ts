import type { Handle } from '@sveltejs/kit/hooks';

import { error, redirect } from '@sveltejs/kit';
import { okAsync } from 'neverthrow';

import { json } from '../api';
import { background } from '../platform/runtime';

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
	const isApi = pathname.startsWith('/api/');

	// The health check (Docker, load balancers) answers even when the databases are unreachable,
	// and API routes answer preflights themselves (static, no database), so browsers on other
	// origins get to read the error of the request itself.
	if (pathname === '/api/health' || (isApi && event.request.method === 'OPTIONS')) {
		return resolve(event);
	}

	// Errors of the API carry the CORS headers too (SvelteKit's error responses have none), so
	// client apps see the message instead of a network error.
	const fail = (status: number, message: string) => {
		if (isApi) {
			return json({ message }, status);
		}

		error(status, message);
	};

	const result = await services
		.install()
		.getState()
		.andThen((state) =>
			// `POUCHBASE_ADMIN_EMAIL` and `POUCHBASE_ADMIN_PASSWORD` install it without the wizard.
			state === 'account'
				? services
						.install()
						.installFromEnv()
						.map((done) => (done ? 'done' : state))
				: okAsync(state)
		);

	if (result.isErr()) {
		if (result.error.code === 2002) {
			return fail(500, `Pouchbase can't install itself: ${result.error.data.reason}`);
		}

		console.error('[pouchbase] Could not check the installation', result.error);
		return fail(500, result.error.message);
	}

	// Installations created by an older version may have pending migrations and miss the
	// built-in collections. Both are cached per isolate after the first request.
	if (result.value === 'done') {
		const ready = await services
			.database()
			.migrate()
			.andThen(() => services.auth().ensureUsersCollection());

		if (ready.isErr()) {
			return fail(500, ready.error.message);
		}

		// Gives the Worker D1 bindings when it has none yet (right after installing, or after a
		// deploy replaced them). Queries use the REST API until then, so this runs in the background.
		const attached = services
			.database()
			.attach()
			.mapErr((failure) => {
				console.error('[pouchbase] Could not add D1 bindings', failure);
			});

		background(Promise.resolve(attached));
	}

	// Remote functions and assets (`/_app/...`) handle their own access.
	if (pathname.startsWith('/_app/')) {
		return resolve(event);
	}

	// `/internal/tick` (scheduled work) checks its own token.
	if (isApi || pathname.startsWith('/internal/')) {
		if (result.value !== 'done') {
			return fail(503, 'Pouchbase is not installed yet');
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
