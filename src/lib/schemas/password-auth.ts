import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

export const appPassword = z
	.string()
	.min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
	.max(128, 'Password must be at most 128 characters');

/** The full name of an app user, such as `Ada Lovelace`. */
export const appName = z
	.string()
	.trim()
	.min(1, 'Enter your name')
	.max(100, 'Name must be at most 100 characters');

export const appEmail = z.string().trim().toLowerCase().pipe(z.email('Invalid email address'));

/** Sign-up of an app user with name, email and password (public API). */
export const passwordSignUpSchema = z.object({
	name: appName,
	email: appEmail,
	password: appPassword
});

export type PasswordSignUpInput = z.input<typeof passwordSignUpSchema>;

/** Sign-in of an app user with email and password (public API). */
export const passwordSignInSchema = z.object({
	email: z.string().trim().toLowerCase().min(1, 'Enter your email address'),
	password: z.string().min(1, 'Enter your password')
});

/** Settings of the email & password provider (Authentication page). */
export const passwordProviderSchema = z.object({
	enabled: z.boolean().default(false),
	signUp: z.boolean().default(false),
	requireVerification: z.boolean().default(false)
});

/** New password from the reset email (account page). */
export const resetPasswordSchema = z
	.object({
		/** Hidden field: the token from the link. */
		token: z.string().min(1),
		_password: appPassword,
		_passwordConfirm: z.string()
	})
	.refine((data) => data._password === data._passwordConfirm, {
		path: ['_passwordConfirm'],
		message: 'Passwords do not match'
	});

/** Confirms the address with the token from the verification email (account page). */
export const verifyEmailSchema = z.object({
	/** Hidden field: the token from the link. */
	token: z.string().min(1)
});
