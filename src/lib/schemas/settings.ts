import { z } from 'zod';

import { PROVIDER_ID_PATTERN } from '#lib/auth/oauth-providers.js';

export const oauthProviderSchema = z.object({
	/** Hidden field. */
	provider: z.string().regex(PROVIDER_ID_PATTERN),
	enabled: z.boolean().default(false),
	clientId: z.string().trim().max(500),
	/** Leading underscore: never sent back to the browser. Empty keeps the stored secret. */
	_clientSecret: z.string().trim().max(500).optional()
});
