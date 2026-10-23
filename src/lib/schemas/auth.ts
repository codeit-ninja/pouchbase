import { z } from 'zod';

export const loginSchema = z.object({
	email: z.string().trim().toLowerCase().min(1, 'Enter your email address'),
	_password: z.string().min(1, 'Enter your password')
});
