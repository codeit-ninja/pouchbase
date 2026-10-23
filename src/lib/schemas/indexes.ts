import { z } from 'zod';

function parseColumns(value: string) {
	try {
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

export const createIndexSchema = z.object({
	/** Collection name, sent as a hidden field. */
	collection: z.string(),
	/** JSON array of column names, from the multi-select. */
	columns: z
		.string()
		.refine((value) => parseColumns(value).length > 0, 'Choose at least one column')
		.transform(parseColumns),
	unique: z.boolean().default(false)
});

export const updateIndexSchema = createIndexSchema.extend({
	/** Hidden field: the index to replace. */
	name: z.string()
});

export const deleteIndexSchema = z.object({
	/** Hidden fields. */
	collection: z.string(),
	name: z.string()
});
