import type { MailAddress, MailMessage } from './types';

/**
 * Builds the RFC 5322 message that is sent over SMTP: headers plus a `multipart/alternative` body
 * with a plain-text and an HTML part. Both parts are base64-encoded, so lines stay short and no
 * line of the body can start with a dot.
 */

const encoder = new TextEncoder();

/** Base64 of the UTF-8 bytes of a string. */
export function base64(value: string) {
	const bytes = encoder.encode(value);
	let binary = '';

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

/** Header values can't contain line breaks; they would let a value add headers of its own. */
function singleLine(value: string) {
	return value.replace(/[\r\n]+/g, ' ').trim();
}

/** A header value as an RFC 2047 encoded word when it isn't plain ASCII. */
function encodeWord(value: string) {
	return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${base64(value)}?=`;
}

export function formatAddress({ address, name }: MailAddress) {
	const email = singleLine(address);

	if (!name?.trim()) {
		return `<${email}>`;
	}

	const display = singleLine(name);
	const encoded = /^[\x20-\x7e]*$/.test(display)
		? `"${display.replace(/["\\]/g, '\\$&')}"`
		: encodeWord(display);

	return `${encoded} <${email}>`;
}

/** Splits base64 into lines of 76 characters (RFC 2045). */
function wrap(value: string) {
	return value.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function randomId() {
	return crypto.randomUUID().replace(/-/g, '');
}

export function buildMessage(message: MailMessage) {
	const boundary = `pouchbase-${randomId()}`;
	const domain = message.from.address.split('@')[1] ?? 'localhost';

	const headers = [
		`From: ${formatAddress(message.from)}`,
		`To: ${formatAddress(message.to)}`,
		`Subject: ${encodeWord(singleLine(message.subject))}`,
		`Date: ${new Date().toUTCString()}`,
		`Message-ID: <${randomId()}@${singleLine(domain)}>`,
		'MIME-Version: 1.0',
		`Content-Type: multipart/alternative; boundary="${boundary}"`
	];

	const part = (type: string, content: string) =>
		[
			`--${boundary}`,
			`Content-Type: ${type}; charset=utf-8`,
			'Content-Transfer-Encoding: base64',
			'',
			wrap(base64(content))
		].join('\r\n');

	return [
		...headers,
		'',
		part('text/plain', message.text),
		part('text/html', message.html),
		`--${boundary}--`,
		''
	].join('\r\n');
}
