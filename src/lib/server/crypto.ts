import type { IdGenerator } from '#lib/fields/field-types.js';

// Workers allows at most 100,000 PBKDF2 iterations.
const PBKDF2_ITERATIONS = 100_000;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string) {
	return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array) {
	return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
	if (a.length !== b.length) {
		return false;
	}

	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
		'deriveBits'
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
		key,
		256
	);
	return new Uint8Array(bits);
}

/** Hash in the format `pbkdf2$<iterations>$<salt>$<hash>` (base64). */
export async function hashPassword(password: string) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [algorithm, iterations, salt, hash] = stored.split('$');

	if (algorithm !== 'pbkdf2') {
		return false;
	}

	const actual = await pbkdf2(password, fromBase64(salt), Number(iterations));
	return timingSafeEqual(actual, fromBase64(hash));
}

/** Random, URL-safe token (256 bits). */
export function generateToken() {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** SHA-256 hash of a token, so tokens are never stored in plain text. */
export async function hashToken(token: string) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
	return toBase64Url(new Uint8Array(digest));
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 15 character record id, like PocketBase. */
export function generateRecordId() {
	const bytes = crypto.getRandomValues(new Uint8Array(15));
	return Array.from(bytes, (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

/** UUID version 7 (RFC 9562): a 48-bit millisecond timestamp followed by random bits. */
export function generateUuidV7() {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	let time = Date.now();

	for (let index = 5; index >= 0; index--) {
		bytes[index] = time % 256;
		time = Math.floor(time / 256);
	}

	bytes[6] = (bytes[6] & 0x0f) | 0x70;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The key of a new record for an `id` field with this generator; `null` for `autoincrement`,
 * whose value the database assigns.
 */
export function generateId(generator: IdGenerator) {
	switch (generator) {
		case 'autoincrement':
			return null;
		case 'uuid':
			return crypto.randomUUID();
		case 'uuidv7':
			return generateUuidV7();
		case 'random':
			return generateRecordId();
	}
}
