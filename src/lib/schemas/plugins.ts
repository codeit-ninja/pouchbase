import { PLUGIN_ID_PATTERN } from '@pouchbasejs/plugin-sdk';
import { z } from 'zod';

export const pluginIdSchema = z.object({ id: z.string().regex(PLUGIN_ID_PATTERN) });

export const searchPluginsSchema = z.object({
	query: z.string().trim().max(100),
	page: z.number().int().positive()
});
