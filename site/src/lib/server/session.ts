import type { User } from '@pouchbasejs/js-sdk';
import type { Cookies } from '@sveltejs/kit';

import { isTokenValid } from '@pouchbasejs/js-sdk';
import { redirect } from '@sveltejs/kit';

import { getRequestEvent } from '$app/server';

import { pouchbase } from './pouchbase';

/**
 * Accounts on the site are users of the Pouchbase instance. After signing in, the user's token
 * (a JWT, valid for 7 days) is kept in an HTTP-only cookie; the instance checks it on every use, so
 * a forged cookie gets nobody anywhere.
 */

const COOKIE = 'pb_session';

/** Seven days, as long as the token is valid. */
const MAX_AGE = 60 * 60 * 24 * 7;

export function startSession(cookies: Cookies, token: string) {
	cookies.set(COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: MAX_AGE
	});
}

export function endSession(cookies: Cookies) {
	cookies.delete(COOKIE, { path: '/' });
}

/** The token of the signed-in user, `null` when there is none or it expired. */
export function sessionToken(cookies: Cookies) {
	const token = cookies.get(COOKIE);

	return token && isTokenValid(token) ? token : null;
}

/** The signed-in user, checked with the instance once per request; `null` when signed out. */
export async function currentUser(): Promise<User | null> {
	const { cookies, locals } = getRequestEvent();

	if (locals.user !== undefined) {
		return locals.user;
	}

	const token = sessionToken(cookies);
	const user = token ? await pouchbase(token).auth.me() : null;

	if (!user && cookies.get(COOKIE)) {
		endSession(cookies);
	}

	locals.user = user;

	return user;
}

/** The signed-in user; redirects to the sign-in page, and back here afterwards, without one. */
export async function requireUser(): Promise<User> {
	const user = await currentUser();

	if (!user) {
		const { url } = getRequestEvent();

		redirect(303, `/account/sign-in?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}

	return user;
}
