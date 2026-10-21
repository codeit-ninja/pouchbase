import { z } from 'zod';

import { OAUTH_PROVIDER_IDS } from '#lib/auth/oauth-providers.js';

export const generalSettingsSchema = z.object({
	appName: z.string().trim().min(1, 'Enter a name').max(64, 'Name must be at most 64 characters')
});

export const oauthProviderSchema = z.object({
	/** Hidden field. */
	provider: z.enum(OAUTH_PROVIDER_IDS),
	enabled: z.boolean().default(false),
	clientId: z.string().trim().max(500),
	/** Leading underscore: never sent back to the browser. Empty keeps the stored secret. */
	_clientSecret: z.string().trim().max(500).optional()
});
