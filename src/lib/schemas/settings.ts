import { z } from 'zod';

import { OAUTH_PROVIDER_IDS } from '#lib/auth/oauth-providers.js';
import { ENVIRONMENTS } from '#lib/environments/snapshot.js';

export const generalSettingsSchema = z.object({
	/** `none` when the instance doesn't use environments. */
	environment: z.enum(['none', ...ENVIRONMENTS]).default('none')
});

export const oauthProviderSchema = z.object({
	/** Hidden field. */
	provider: z.enum(OAUTH_PROVIDER_IDS),
	enabled: z.boolean().default(false),
	clientId: z.string().trim().max(500),
	/** Leading underscore: never sent back to the browser. Empty keeps the stored secret. */
	_clientSecret: z.string().trim().max(500).optional()
});
