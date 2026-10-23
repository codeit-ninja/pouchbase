/** Reads the payload of a JWT without verifying it, or `null` when it isn't a JWT. */
export function decodeToken(token: string): Record<string, unknown> | null {
	const part = token.split('.')[1];

	if (!part) {
		return null;
	}

	try {
		const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
		const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));

		return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** Whether a JWT has not expired yet (with a margin in seconds). Tokens without `exp` never expire. */
export function isTokenValid(token: string, marginSeconds = 0): boolean {
	const payload = decodeToken(token);

	if (!payload) {
		return false;
	}

	if (typeof payload.exp !== 'number') {
		return true;
	}

	return payload.exp - marginSeconds > Date.now() / 1000;
}
