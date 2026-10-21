import { z } from 'zod';

export const username = z
	.string()
	.trim()
	.toLowerCase()
	.min(3, 'Username must be at least 3 characters')
	.max(32, 'Username must be at most 32 characters')
	.regex(/^[a-z0-9_.-]+$/, 'Only letters, numbers, dots, dashes and underscores');

export const accountSchema = z
	.object({
		username,
		email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
		_password: z
			.string()
			.min(10, 'Password must be at least 10 characters')
			.max(128, 'Password must be at most 128 characters'),
		_passwordConfirm: z.string()
	})
	.refine((input) => input._password === input._passwordConfirm, {
		message: 'Passwords do not match',
		path: ['_passwordConfirm']
	});

export const settingsSchema = z.object({
	appName: z.string().trim().min(1, 'Enter a name').max(64, 'Name must be at most 64 characters')
});
