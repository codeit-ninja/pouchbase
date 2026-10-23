/** Base64url without padding. */
function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

/** A random URL-safe string from `bytes` random bytes. */
export function randomString(bytes: number): string {
	return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** The S256 PKCE challenge of a verifier (RFC 7636). */
export async function s256(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));

	return base64url(new Uint8Array(digest));
}
