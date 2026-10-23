import { MAX_BUNDLE_SIZE } from '@pouchbasejs/plugin-sdk';
import { z } from 'zod';

/** Signing in with a username or email and a password. */
export const signInSchema = z.object({
	identity: z.string().trim().min(1, 'Enter your username or email'),
	_password: z.string().min(1, 'Enter your password'),
	redirectTo: z.string().optional()
});

/**
 * A new account, with the rules of the instance's sign-up (`passwordSignUpSchema` in the app), so
 * mistakes show before the request; the instance checks that username and email are unique.
 */
export const signUpSchema = z.object({
	username: z
		.string()
		.trim()
		.toLowerCase()
		.min(3, 'Username must be at least 3 characters')
		.max(32, 'Username must be at most 32 characters')
		.regex(/^[a-z0-9_.-]+$/, 'Only letters, numbers, dots, dashes and underscores'),
	email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
	_password: z
		.string()
		.min(8, 'Password must be at least 8 characters')
		.max(128, 'Password must be at most 128 characters')
});

/** A new publish token for `pouchbase-plugin publish`. */
export const publishTokenSchema = z.object({
	name: z.string().trim().min(1, 'Enter a name').max(100, 'Name must be at most 100 characters')
});

export const publishTokenIdSchema = z.object({ id: z.string().min(1) });

/** A bundle from `pouchbase-plugin build`, uploaded on the account page. */
export const uploadBundleSchema = z.object({
	bundle: z
		.file('Choose a bundle')
		.max(MAX_BUNDLE_SIZE, `Bundles are at most ${MAX_BUNDLE_SIZE / 1024} KiB`)
		.refine((file) => file.name.endsWith('.json'), 'Choose the .json file in dist/')
});
