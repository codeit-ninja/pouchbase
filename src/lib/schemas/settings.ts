import { z } from 'zod';

import { OAUTH_PROVIDER_IDS } from '#lib/auth/oauth-providers.js';

export const oauthProviderSchema = z.object({
	/** Hidden field. */
	provider: z.enum(OAUTH_PROVIDER_IDS),
	enabled: z.boolean().default(false),
	clientId: z.string().trim().max(500),
	/** Leading underscore: never sent back to the browser. Empty keeps the stored secret. */
	_clientSecret: z.string().trim().max(500).optional()
});
