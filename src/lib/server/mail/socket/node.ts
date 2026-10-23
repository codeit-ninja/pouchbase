import type { OpenConnection, SmtpConnection } from '../types';

import net from 'node:net';
import tls from 'node:tls';

/** SMTP connections on Node (the Node target and `vite dev`), with `node:net` and `node:tls`. */
export const openConnection: OpenConnection = (host, port, security) =>
	new Promise((resolve, reject) => {
		const raw =
			security === 'tls'
				? tls.connect({ host, port, servername: host })
				: net.connect({ host, port });

		raw.once(security === 'tls' ? 'secureConnect' : 'connect', () => {
			raw.off('error', reject);
			resolve(connection(host, raw));
		});
		raw.once('error', reject);
	});

function connection(host: string, initial: net.Socket): SmtpConnection {
	let socket = initial;
	const chunks: Uint8Array[] = [];
	let waiting: ((chunk: Uint8Array | null) => void) | null = null;
	let closed = false;
	let failure: Error | null = null;

	function push(chunk: Uint8Array | null) {
		if (waiting) {
			const resolve = waiting;
			waiting = null;
			resolve(chunk);
		} else if (chunk) {
			chunks.push(chunk);
		}
	}

	function listen(target: net.Socket) {
		target.on('data', (chunk: Buffer) => push(new Uint8Array(chunk)));
		target.on('end', () => {
			closed = true;
			push(null);
		});
		target.on('error', (error) => {
			failure = error;
			closed = true;
			push(null);
		});
	}

	listen(socket);

	return {
		write(data) {
			return new Promise((resolve, reject) => {
				socket.write(data, (error) => (error ? reject(error) : resolve()));
			});
		},
		read() {
			if (chunks.length) {
				return Promise.resolve(chunks.shift()!);
			}

			if (failure) {
				return Promise.reject(failure);
			}

			if (closed) {
				return Promise.resolve(null);
			}

			return new Promise((resolve) => {
				waiting = resolve;
			});
		},
		startTls() {
			// The TLS socket takes over the plain one; its listeners must not see the handshake.
			socket.removeAllListeners('data');
			socket.removeAllListeners('end');
			socket.removeAllListeners('error');

			return new Promise((resolve, reject) => {
				const secure = tls.connect({ socket, servername: host });

				secure.once('secureConnect', () => {
					secure.off('error', reject);
					socket = secure;
					listen(secure);
					resolve();
				});
				secure.once('error', reject);
			});
		},
		close() {
			socket.destroy();
			return Promise.resolve();
		}
	};
}
