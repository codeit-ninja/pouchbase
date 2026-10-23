import type { MailMessage } from './types';

import { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } from '$app/env/private';

import { api } from '../platform/cloudflare/api';

/**
 * Cloudflare Email Service through its REST API, with the app's own Cloudflare credentials (the
 * token needs Email Sending: Edit). Its SMTP endpoint is the same pipeline, but Workers can't open
 * sockets to Cloudflare's IP ranges, so the API is used on every runtime.
 */

type SendResult = {
	delivered: string[];
	permanent_bounces: string[];
	queued: string[];
};

/** Whether the app has the Cloudflare credentials this needs. */
export function cloudflareMailAvailable() {
	return !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN);
}

export async function sendCloudflare(message: MailMessage) {
	const result = await api<SendResult>('/email/sending/send', {
		method: 'POST',
		body: JSON.stringify({
			from: { address: message.from.address, name: message.from.name || undefined },
			to: message.to.address,
			subject: message.subject,
			text: message.text,
			html: message.html
		})
	});

	if (result.permanent_bounces?.length) {
		throw new Error(`Permanent bounce: ${result.permanent_bounces.join(', ')}`);
	}
}
