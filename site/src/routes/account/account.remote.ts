import { isPouchbaseError } from '@pouchbasejs/js-sdk';
import { error, invalid, redirect } from '@sveltejs/kit';
import { z } from 'zod';

import { command, form, getRequestEvent, query } from '$app/server';

import {
	publishTokenIdSchema,
	publishTokenSchema,
	signInSchema,
	signUpSchema,
	uploadBundleSchema,
	verificationSchema
} from '#lib/schemas/account.js';
import { pouchbase } from '#lib/server/pouchbase.js';
import {
	createPublishToken,
	deletePublishToken,
	listPublishTokens
} from '#lib/server/publish-tokens.js';
import { listOwnPlugins, publishVersion, RegistryFailure } from '#lib/server/registry.js';
import { currentUser, endSession, startSession } from '#lib/server/session.js';

/** Only paths on this site, so a sign-in link can't send people elsewhere. */
function safeRedirect(target: string | undefined) {
	return target?.startsWith('/') && !target.startsWith('//') ? target : '/account';
}

async function signedIn() {
	const user = await currentUser();

	if (!user) {
		error(401, 'Sign in first');
	}

	return user;
}

/** The signed-in user, or `null`. */
export const getUser = query(async () => {
	const user = await currentUser();

	return user ? { id: user.id, name: String(user.name ?? ''), email: user.email } : null;
});

/** OAuth providers enabled on the instance, for the sign-in buttons. */
export const getProviders = query(async () => {
	try {
		return await pouchbase().auth.providers();
	} catch {
		return [];
	}
});

export const signIn = form(signInSchema, async (data) => {
	const { cookies } = getRequestEvent();

	try {
		const { token } = await pouchbase().auth.signIn(data.email, data._password);

		startSession(cookies, token);
	} catch (cause) {
		if (isPouchbaseError(cause) && cause.status === 401) {
			invalid('Wrong email or password');
		}

		// The page then offers to send the verification email again.
		if (isPouchbaseError(cause) && cause.code === 'email_not_verified') {
			return { unverified: true, email: data.email.toLowerCase() };
		}

		if (isPouchbaseError(cause) && cause.status === 403) {
			invalid('Signing in with a password is turned off');
		}

		error(502, 'Could not sign in, try again later');
	}

	redirect(303, safeRedirect(data.redirectTo));
});

/**
 * Creates an account. The instance requires a verified email, so there is no session yet: the
 * page asks to follow the link in the verification email and then sign in.
 */
export const signUp = form(signUpSchema, async (data, issue) => {
	const { cookies } = getRequestEvent();

	try {
		const result = await pouchbase().auth.signUp({
			name: data.name,
			email: data.email,
			password: data._password
		});

		if (result.verificationRequired) {
			return { verify: true, email: data.email };
		}

		startSession(cookies, result.token);
	} catch (cause) {
		if (isPouchbaseError(cause) && (cause.status === 400 || cause.status === 409)) {
			const issues = cause.issues;

			invalid(
				...(issues.name ? [issue.name(issues.name)] : []),
				...(issues.email ? [issue.email(issues.email)] : []),
				...(issues.password ? [issue._password(issues.password)] : []),
				...(Object.keys(issues).length ? [] : [cause.message])
			);
		}

		if (isPouchbaseError(cause) && cause.status === 403) {
			invalid('Sign-up is closed');
		}

		error(502, 'Could not create the account, try again later');
	}

	redirect(303, '/account');
});

/** Sends the verification email again; answers the same whether or not the address has an account. */
export const resendVerification = form(verificationSchema, async (data) => {
	try {
		await pouchbase().auth.requestVerification(data.email);
	} catch {
		error(502, 'Could not send the email, try again later');
	}

	return { sent: true };
});

/** Starts a session with the token of an OAuth sign-in in the browser, after the instance checked it. */
export const startOAuthSession = command(z.string().min(1), async (token) => {
	const { cookies, locals } = getRequestEvent();
	const user = await pouchbase(token)
		.auth.me()
		.catch(() => null);

	if (!user) {
		error(401, 'The sign-in expired, try again');
	}

	startSession(cookies, token);
	locals.user = user;
});

export const signOut = form(async () => {
	endSession(getRequestEvent().cookies);

	redirect(303, '/');
});

/** The signed-in user's plugins, newest first. */
export const getMyPlugins = query(async () => {
	const user = await signedIn();
	const plugins = await listOwnPlugins(user.id).catch(() => error(502, 'Could not load plugins'));

	return plugins.map((plugin) => ({
		id: plugin.id,
		slug: plugin.slug,
		name: plugin.name,
		description: plugin.description,
		version: plugin.version,
		downloads: plugin.downloads,
		verified: plugin.verified,
		updatedAt: plugin.updated_at
	}));
});

/** Publishes an uploaded bundle as the signed-in user, like `pouchbase-plugin publish`. */
export const uploadBundle = form(uploadBundleSchema, async (data, issue) => {
	const user = await signedIn();
	const { url } = getRequestEvent();
	const bytes = new Uint8Array(await data.bundle.arrayBuffer());
	let slug = '';

	try {
		slug = (JSON.parse(new TextDecoder().decode(bytes)) as { manifest?: { id?: unknown } }).manifest
			?.id as string;
	} catch {
		invalid(issue.bundle('Not a plugin bundle: build it with pouchbase-plugin build'));
	}

	if (typeof slug !== 'string' || !slug) {
		invalid(issue.bundle('Not a plugin bundle: the manifest has no id'));
	}

	try {
		const version = await publishVersion(url.origin, user.id, slug, bytes);

		void getMyPlugins().refresh();

		return { slug, version: version.version };
	} catch (cause) {
		if (cause instanceof RegistryFailure && cause.status < 500) {
			invalid(
				issue.bundle(
					[cause.message, ...cause.issues.map((item) => `${item.path}: ${item.message}`)].join('. ')
				)
			);
		}

		error(502, 'Could not publish the plugin, try again later');
	}
});

/** The signed-in user's publish tokens, newest first. */
export const getPublishTokens = query(async () => {
	const user = await signedIn();

	return listPublishTokens(user.id).catch(() => error(502, 'Could not load the tokens'));
});

/** Makes a publish token and returns it; it is shown once and can't be read back. */
export const createToken = form(publishTokenSchema, async (data) => {
	const user = await signedIn();
	const created = await createPublishToken(user.id, data.name).catch(() =>
		error(502, 'Could not create the token')
	);

	void getPublishTokens().refresh();

	return { token: created.token };
});

export const deleteToken = form(publishTokenIdSchema, async (data) => {
	const user = await signedIn();
	const deleted = await deletePublishToken(user.id, data.id).catch(() =>
		error(502, 'Could not delete the token')
	);

	if (!deleted) {
		error(404, 'Token not found');
	}

	void getPublishTokens().refresh();

	return { deleted: true };
});
