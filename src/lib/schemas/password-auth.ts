import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

export const appUsername = z
	.string()
	.trim()
	.toLowerCase()
	.min(3, 'Username must be at least 3 characters')
	.max(32, 'Username must be at most 32 characters')
	.regex(/^[a-z0-9_.-]+$/, 'Only letters, numbers, dots, dashes and underscores');

export const appPassword = z
	.string()
	.min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
	.max(128, 'Password must be at most 128 characters');

/** Sign-up of an app user with username and password (public API). */
export const passwordSignUpSchema = z.object({
	username: appUsername,
	password: appPassword,
	email: z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.email('Invalid email address'))
		.optional()
		.or(z.literal('').transform(() => undefined)),
	name: z.string().trim().max(100, 'Name must be at most 100 characters').optional()
});

export type PasswordSignUpInput = z.input<typeof passwordSignUpSchema>;

/** Sign-in of an app user with username and password (public API). */
export const passwordSignInSchema = z.object({
	username: z.string().trim().toLowerCase().min(1, 'Enter your username'),
	password: z.string().min(1, 'Enter your password')
});

/** Settings of the username & password provider (Authentication page). */
export const passwordProviderSchema = z.object({
	enabled: z.boolean().default(false),
	signUp: z.boolean().default(false)
});
