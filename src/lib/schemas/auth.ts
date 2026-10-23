import { z } from 'zod';

export const loginSchema = z.object({
	identity: z.string().trim().toLowerCase().min(1, 'Enter your username or email'),
	_password: z.string().min(1, 'Enter your password')
});
