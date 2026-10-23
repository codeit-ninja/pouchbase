import type { OpenConnection } from '../types';

import { connect } from 'cloudflare:sockets';

/**
 * SMTP connections on Workers, with `cloudflare:sockets`. Workers can't connect to Cloudflare's own
 * IP ranges or to port 25, so Cloudflare Email Service is reached through its REST API instead
 * (`../cloudflare.ts`).
 */
export const openConnection: OpenConnection = async (host, port, security) => {
	let socket = connect(
		{ hostname: host, port },
		{
			secureTransport: security === 'tls' ? 'on' : security === 'starttls' ? 'starttls' : 'off',
			allowHalfOpen: false
		}
	);
	await socket.opened;

	let reader = socket.readable.getReader();
	let writer = socket.writable.getWriter();

	return {
		write(data) {
			return writer.write(data);
		},
		async read() {
			const { value, done } = await reader.read();
			return done ? null : value;
		},
		async startTls() {
			reader.releaseLock();
			writer.releaseLock();
			socket = socket.startTls();
			await socket.opened;
			reader = socket.readable.getReader();
			writer = socket.writable.getWriter();
		},
		close() {
			return socket.close();
		}
	};
};
