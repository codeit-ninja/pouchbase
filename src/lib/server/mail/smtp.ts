import type { MailMessage, SmtpConfig, SmtpConnection } from './types';

import { base64, buildMessage } from './mime';
import { openConnection } from './socket';
import { SmtpError } from './types';

/**
 * A minimal SMTP client (RFC 5321) on top of a raw TCP connection, so it runs on Workers
 * (`cloudflare:sockets`) as well as on Node: EHLO, optional STARTTLS, AUTH PLAIN or LOGIN, one
 * message, QUIT. Throws `SmtpError` when the server rejects a step.
 */

/** How long a whole delivery may take. */
const TIMEOUT = 20_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Reply = {
	code: number;
	lines: string[];
};

/** Reads complete replies from the connection; a reply can span several `250-...` lines. */
class ReplyReader {
	private buffer = '';

	constructor(private readonly connection: SmtpConnection) {}

	async next(): Promise<Reply> {
		const lines: string[] = [];

		for (;;) {
			const end = this.buffer.indexOf('\r\n');

			if (end === -1) {
				const chunk = await this.connection.read();

				if (!chunk) {
					throw new SmtpError(0, 'Connection closed by the server');
				}

				this.buffer += decoder.decode(chunk, { stream: true });
				continue;
			}

			const line = this.buffer.slice(0, end);
			this.buffer = this.buffer.slice(end + 2);
			lines.push(line);

			// `250-...` continues the reply, `250 ...` ends it.
			if (/^\d{3}(?: |$)/.test(line)) {
				return { code: Number(line.slice(0, 3)), lines: lines.map((l) => l.slice(4)) };
			}
		}
	}
}

class Session {
	private readonly replies: ReplyReader;

	constructor(private readonly connection: SmtpConnection) {
		this.replies = new ReplyReader(connection);
	}

	async expect(...codes: number[]) {
		const reply = await this.replies.next();

		if (!codes.includes(reply.code)) {
			throw new SmtpError(reply.code, reply.lines.join(' '));
		}

		return reply;
	}

	async command(line: string, ...codes: number[]) {
		await this.connection.write(encoder.encode(`${line}\r\n`));
		return this.expect(...codes);
	}

	async data(message: string) {
		// Dot-stuffing: a line that starts with a dot gets another one (RFC 5321, 4.5.2).
		const stuffed = message.replace(/^\./gm, '..');
		await this.connection.write(encoder.encode(`${stuffed}\r\n.\r\n`));
		return this.expect(250);
	}
}

/** The SMTP extensions from an EHLO reply, e.g. `{ AUTH: 'PLAIN LOGIN', STARTTLS: '' }`. */
function extensions(reply: Reply) {
	return new Map(
		reply.lines.slice(1).map((line) => {
			const [keyword, ...params] = line.split(' ');
			return [keyword.toUpperCase(), params.join(' ').toUpperCase()] as const;
		})
	);
}

/** Domain for EHLO: the sender's domain is accepted by every server we tested. */
function clientName(message: MailMessage) {
	return message.from.address.split('@')[1] || 'localhost';
}

async function deliver(connection: SmtpConnection, config: SmtpConfig, message: MailMessage) {
	const session = new Session(connection);
	const name = clientName(message);

	await session.expect(220);
	let ehlo = await session.command(`EHLO ${name}`, 250);

	if (config.security === 'starttls') {
		await session.command('STARTTLS', 220);
		await connection.startTls();
		ehlo = await session.command(`EHLO ${name}`, 250);
	}

	if (config.username) {
		const methods = extensions(ehlo).get('AUTH')?.split(' ') ?? [];

		if (methods.includes('PLAIN') || !methods.includes('LOGIN')) {
			await session.command(
				`AUTH PLAIN ${base64(`\0${config.username}\0${config.password}`)}`,
				235
			);
		} else {
			await session.command('AUTH LOGIN', 334);
			await session.command(base64(config.username), 334);
			await session.command(base64(config.password), 235);
		}
	}

	await session.command(`MAIL FROM:<${message.from.address}>`, 250);
	await session.command(`RCPT TO:<${message.to.address}>`, 250, 251);
	await session.command('DATA', 354);
	await session.data(buildMessage(message));
	// The message is accepted; a server that hangs up instead of answering QUIT doesn't matter.
	await session.command('QUIT', 221).catch(() => undefined);
}

export async function sendSmtp(config: SmtpConfig, message: MailMessage) {
	const connection = await openConnection(config.host, config.port, config.security);
	let timer: ReturnType<typeof setTimeout> | undefined;

	try {
		await Promise.race([
			deliver(connection, config, message),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new SmtpError(0, 'Timed out')), TIMEOUT);
			})
		]);
	} finally {
		clearTimeout(timer);
		await connection.close().catch(() => undefined);
	}
}
