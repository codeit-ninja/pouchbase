import { z } from 'zod';

/** A new API key (API keys page). */
export const apiKeySchema = z.object({
	name: z.string().trim().min(1, 'Enter a name').max(100, 'Name must be at most 100 characters'),
	/** `service` keys also use the records API without the collections' API rules. */
	scope: z.enum(['standard', 'service'], 'Choose a scope')
});

export const apiKeyIdSchema = z.object({ id: z.string().min(1) });
