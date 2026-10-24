import { z } from 'zod';

export const MAIL_PROVIDERS = ['none', 'cloudflare', 'smtp'] as const;
export const SMTP_SECURITY = ['tls', 'starttls', 'none'] as const;

export type MailProvider = (typeof MAIL_PROVIDERS)[number];

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email address'));

/** Mail settings (Mail page). */
export const mailSettingsSchema = z
	.object({
		provider: z.enum(MAIL_PROVIDERS).default('none'),
		senderName: z.string().trim().max(100, 'Name must be at most 100 characters'),
		senderAddress: email.or(z.literal('')),
		smtpHost: z.string().trim().max(255, 'Host must be at most 255 characters'),
		smtpPort: z
			.number('Enter a port')
			.int('Enter a whole number')
			.min(1, 'Enter a port between 1 and 65535')
			.max(65535, 'Enter a port between 1 and 65535'),
		smtpSecurity: z.enum(SMTP_SECURITY).default('tls'),
		smtpUsername: z.string().trim().max(255, 'Username must be at most 255 characters'),
		/** Leading underscore: never sent back to the browser. Empty keeps the stored password. */
		_smtpPassword: z.string().max(1000).optional()
	})
	.superRefine((data, ctx) => {
		if (data.provider !== 'none' && !data.senderAddress) {
			ctx.addIssue({ code: 'custom', path: ['senderAddress'], message: 'Enter a sender address' });
		}

		if (data.provider === 'smtp' && !data.smtpHost) {
			ctx.addIssue({ code: 'custom', path: ['smtpHost'], message: 'Enter the SMTP server' });
		}
	});

/** Sends a test email (Mail page). */
export const testMailSchema = z.object({
	to: email
});
