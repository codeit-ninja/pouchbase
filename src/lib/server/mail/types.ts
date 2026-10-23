/**
 * Sending mail. Like the platform drivers this is infrastructure: it throws, the mail service wraps
 * it in results.
 */

export type MailAddress = {
	address: string;
	name?: string;
};

export type MailMessage = {
	from: MailAddress;
	to: MailAddress;
	subject: string;
	text: string;
	html: string;
};

/** How the connection to an SMTP server is secured. */
export type SmtpSecurity = 'tls' | 'starttls' | 'none';

export type SmtpConfig = {
	host: string;
	port: number;
	security: SmtpSecurity;
	/** Empty sends without authentication. */
	username: string;
	password: string;
};

/**
 * A TCP connection to an SMTP server, opened by `./socket` for the runtime the app runs on
 * (`cloudflare:sockets` on Workers, `node:net`/`node:tls` on Node).
 */
export interface SmtpConnection {
	write(data: Uint8Array): Promise<void>;
	/** The next chunk from the server, or `null` when the connection closed. */
	read(): Promise<Uint8Array | null>;
	/** Upgrades the connection to TLS, after the server accepted `STARTTLS`. */
	startTls(): Promise<void>;
	close(): Promise<void>;
}

export type OpenConnection = (
	host: string,
	port: number,
	security: SmtpSecurity
) => Promise<SmtpConnection>;

/** An SMTP reply the client didn't expect, with the server's code and text. */
export class SmtpError extends Error {
	constructor(
		readonly code: number,
		readonly reply: string
	) {
		super(`SMTP (${code}): ${reply}`);
	}
}
