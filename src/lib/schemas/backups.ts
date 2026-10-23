import { z } from 'zod';

import { CRON_PRESETS, parseCron } from '#lib/backups/cron.js';

/** An S3-compatible bucket for backups (Backups page). */
export const backupDestinationSchema = z
	.object({
		/** Empty for a new destination. */
		id: z.string().default(''),
		name: z.string().trim().min(1, 'Enter a name').max(100, 'Name must be at most 100 characters'),
		endpoint: z.string().trim().min(1, 'Enter the endpoint').max(255),
		region: z.string().trim().min(1, 'Enter the region').max(100),
		bucket: z.string().trim().min(1, 'Enter the bucket').max(255),
		accessKeyId: z.string().trim().min(1, 'Enter the access key ID').max(255),
		/** Leading underscore: never sent back to the browser. Empty keeps the stored secret. */
		_secretAccessKey: z.string().max(1000).optional(),
		pathStyle: z.boolean().default(false),
		prefix: z
			.string()
			.trim()
			.max(200, 'Folder must be at most 200 characters')
			.transform((value) => value.replace(/^\/+|\/+$/g, ''))
			.refine((value) => !value.split('/').some((segment) => segment === '' || segment === '..'), {
				message: 'Enter a folder like backups/pouchbase'
			})
	})
	.superRefine((data, ctx) => {
		if (!URL.canParse(data.endpoint) || !/^https?:$/.test(new URL(data.endpoint).protocol)) {
			ctx.addIssue({
				code: 'custom',
				path: ['endpoint'],
				message: 'Enter a URL starting with https://'
			});
		}
	});

/** `custom` shows a field for a cron expression. */
export const SCHEDULE_FREQUENCIES = [...CRON_PRESETS.map((preset) => preset.value), 'custom'];

/** A backup that runs on a schedule (Backups page). */
export const backupScheduleSchema = z
	.object({
		/** Empty for a new schedule. */
		id: z.string().default(''),
		destinationId: z.string().min(1, 'Choose a destination'),
		frequency: z.string().refine((value) => SCHEDULE_FREQUENCIES.includes(value), {
			message: 'Choose how often'
		}),
		cron: z.string().trim().max(100).default(''),
		includeFiles: z.boolean().default(false),
		keep: z
			.number('Enter a number')
			.int('Enter a whole number')
			.min(0, 'Enter 0 or more')
			.max(1000, 'Enter at most 1000'),
		enabled: z.boolean().default(false)
	})
	.superRefine((data, ctx) => {
		if (data.frequency === 'custom' && !parseCron(data.cron)) {
			ctx.addIssue({
				code: 'custom',
				path: ['cron'],
				message: 'Enter five fields, e.g. 30 2 * * 1-5'
			});
		}
	});

/** Starts a backup right away. */
export const createBackupSchema = z.object({
	destinationId: z.string().min(1, 'Choose a destination'),
	includeFiles: z.boolean().default(false)
});

/** Replaces the data with a backup. */
export const restoreBackupSchema = z.object({
	backupId: z.string().min(1),
	includeFiles: z.boolean().default(false),
	confirm: z.literal('restore', 'Type restore to confirm')
});

export const idSchema = z.object({ id: z.string().min(1) });
