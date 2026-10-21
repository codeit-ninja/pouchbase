import { z } from 'zod';

export const loginSchema = z.object({
	username: z.string().trim().toLowerCase().min(1, 'Enter your username'),
	_password: z.string().min(1, 'Enter your password')
});
