import { z } from 'zod';

export const STORAGE_PROVIDERS = ['r2', 's3'] as const;

export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

/** Where uploaded files are stored (Storage page). */
export const storageSettingsSchema = z
	.object({
		provider: z.enum(STORAGE_PROVIDERS).default('r2'),
		endpoint: z.string().trim().max(255, 'Endpoint must be at most 255 characters'),
		region: z.string().trim().max(100, 'Region must be at most 100 characters'),
		bucket: z.string().trim().max(255, 'Bucket must be at most 255 characters'),
		accessKeyId: z.string().trim().max(255, 'Access key ID must be at most 255 characters'),
		/** Leading underscore: never sent back to the browser. Empty keeps the stored secret. */
		_secretAccessKey: z.string().max(1000).optional(),
		pathStyle: z.boolean().default(false)
	})
	.superRefine((data, ctx) => {
		if (data.provider !== 's3') {
			return;
		}

		if (!data.endpoint) {
			ctx.addIssue({ code: 'custom', path: ['endpoint'], message: 'Enter the endpoint' });
		} else if (!URL.canParse(data.endpoint) || !/^https?:$/.test(new URL(data.endpoint).protocol)) {
			ctx.addIssue({
				code: 'custom',
				path: ['endpoint'],
				message: 'Enter a URL starting with https://'
			});
		}

		if (!data.region) {
			ctx.addIssue({ code: 'custom', path: ['region'], message: 'Enter the region' });
		}

		if (!data.bucket) {
			ctx.addIssue({ code: 'custom', path: ['bucket'], message: 'Enter the bucket' });
		}

		if (!data.accessKeyId) {
			ctx.addIssue({ code: 'custom', path: ['accessKeyId'], message: 'Enter the access key ID' });
		}
	});
