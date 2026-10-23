import { z } from 'zod';

import { parseThumbnailSize, splitThumbnailSizes } from '#lib/files/thumbnails.js';

export const thumbnailSettingsSchema = z
	.object({
		/** Collection name, sent as a hidden field. */
		collection: z.string(),
		enabled: z.boolean().default(false),
		/** Sizes in PocketBase syntax, separated by commas or new lines. */
		sizes: z.string().max(2000)
	})
	.superRefine((data, ctx) => {
		const invalid = splitThumbnailSizes(data.sizes).filter((spec) => !parseThumbnailSize(spec));

		if (invalid.length) {
			ctx.addIssue({
				code: 'custom',
				path: ['sizes'],
				message: `Not a valid size: ${invalid.join(', ')}. Use e.g. 100x100, 300x0, 0x200 or 800x600f.`
			});
		}

		if (data.enabled && !splitThumbnailSizes(data.sizes).length) {
			ctx.addIssue({ code: 'custom', path: ['sizes'], message: 'Add at least one size' });
		}
	});

/** Edits from the image editor; see `ImageEdits` in `src/lib/server/images.ts`. */
export const imageEditsSchema = z.object({
	id: z.string().min(1),
	edits: z.object({
		rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
		flipHorizontal: z.boolean().optional(),
		flipVertical: z.boolean().optional(),
		crop: z
			.object({
				x: z.number().min(0),
				y: z.number().min(0),
				width: z.number().positive(),
				height: z.number().positive()
			})
			.optional(),
		resize: z
			.object({
				width: z.number().int().min(1).max(8000),
				height: z.number().int().min(1).max(8000)
			})
			.optional(),
		adjustments: z
			.object({
				brightness: z.number().min(-100).max(100),
				contrast: z.number().min(-100).max(100),
				saturation: z.number().min(-100).max(100),
				hue: z.number().min(-180).max(180),
				grayscale: z.number().min(0).max(100),
				sepia: z.number().min(0).max(100)
			})
			.partial()
			.optional(),
		output: z
			.object({
				format: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
				quality: z.number().int().min(1).max(100).optional()
			})
			.optional()
	})
});
