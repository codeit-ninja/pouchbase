import { z } from 'zod';

import { CLOUDFLARE_PLANS } from '#lib/cloudflare/limits.js';

export const cloudflarePlanSchema = z.object({
	plan: z.enum(CLOUDFLARE_PLANS)
});
