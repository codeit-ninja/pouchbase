import { z } from 'zod';

export const adminEmail = z.string().trim().toLowerCase().pipe(z.email('Invalid email address'));

export const adminPassword = z
	.string()
	.min(10, 'Password must be at least 10 characters')
	.max(128, 'Password must be at most 128 characters');

export const accountSchema = z
	.object({
		email: adminEmail,
		_password: adminPassword,
		_passwordConfirm: z.string()
	})
	.refine((input) => input._password === input._passwordConfirm, {
		message: 'Passwords do not match',
		path: ['_passwordConfirm']
	});
