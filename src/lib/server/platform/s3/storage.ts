import type { ObjectStore } from '../types';

import { AwsClient } from 'aws4fetch';

import { PlatformError } from '../types';

/**
 * Any S3-compatible object storage (Amazon S3, Backblaze B2, MinIO, R2's S3 API, ...) through
 * signed `fetch` requests, so it works on Workers and on Node alike.
 */

export type S3Config = {
	/** e.g. `https://s3.eu-central-1.amazonaws.com`. */
	endpoint: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	/** `https://host/bucket/key` instead of `https://bucket.host/key` (needed by e.g. MinIO). */
	pathStyle: boolean;
};

/** Parts of a multipart upload; S3 requires at least 5 MiB for every part but the last. */
const PART_SIZE = 8 * 1024 * 1024;

export class S3Error extends PlatformError {
	constructor(status: number, errors: { code: number; message: string }[]) {
		super(status, errors, 'S3');
	}
}

/** Turns a failed response (an S3 XML error or not) into an `S3Error`. */
async function failure(response: Response) {
	const body = await response.text().catch(() => '');
	const code = /<Code>([^<]*)<\/Code>/.exec(body)?.[1];
	const message = /<Message>([^<]*)<\/Message>/.exec(body)?.[1];

	return new S3Error(response.status, [
		{ code: 0, message: [code, message].filter(Boolean).join(': ') || response.statusText }
	]);
}

function decodeXml(value: string) {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

/** Joins chunks into one buffer for an upload. */
function concat(chunks: Uint8Array[], size: number) {
	const buffer = new Uint8Array(size);
	let offset = 0;

	for (const chunk of chunks) {
		buffer.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return buffer;
}

export function createS3Storage(config: S3Config): ObjectStore {
	const client = new AwsClient({
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		service: 's3',
		region: config.region
	});

	const endpoint = new URL(config.endpoint);

	function url(bucket: string, key = '') {
		const path = key
			.split('/')
			.map((segment) => encodeURIComponent(segment))
			.join('/');

		if (config.pathStyle) {
			return `${endpoint.origin}/${encodeURIComponent(bucket)}/${path}`;
		}

		return `${endpoint.protocol}//${bucket}.${endpoint.host}/${path}`;
	}

	async function startMultipart(bucket: string, key: string, contentType: string) {
		const response = await client.fetch(`${url(bucket, key)}?uploads`, {
			method: 'POST',
			headers: { 'Content-Type': contentType }
		});

		if (!response.ok) {
			throw await failure(response);
		}

		const uploadId = /<UploadId>([^<]*)<\/UploadId>/.exec(await response.text())?.[1];

		if (!uploadId) {
			throw new S3Error(500, [{ code: 0, message: 'No upload id in the response' }]);
		}

		return decodeXml(uploadId);
	}

	async function uploadPart(
		bucket: string,
		key: string,
		uploadId: string,
		number: number,
		body: Uint8Array<ArrayBuffer>
	) {
		const response = await client.fetch(
			`${url(bucket, key)}?partNumber=${number}&uploadId=${encodeURIComponent(uploadId)}`,
			{ method: 'PUT', body }
		);

		if (!response.ok) {
			throw await failure(response);
		}

		return response.headers.get('etag') ?? '';
	}

	async function completeMultipart(bucket: string, key: string, uploadId: string, etags: string[]) {
		const response = await client.fetch(
			`${url(bucket, key)}?uploadId=${encodeURIComponent(uploadId)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/xml' },
				body: `<CompleteMultipartUpload>${etags
					.map(
						(etag, index) =>
							`<Part><PartNumber>${index + 1}</PartNumber><ETag>${etag}</ETag></Part>`
					)
					.join('')}</CompleteMultipartUpload>`
			}
		);

		// S3 can answer 200 with an error in the body.
		const result = response.ok ? await response.text() : '';

		if (!response.ok || result.includes('<Error>')) {
			throw response.ok
				? new S3Error(500, [
						{
							code: 0,
							message: /<Message>([^<]*)<\/Message>/.exec(result)?.[1] ?? 'Upload failed'
						}
					])
				: await failure(response);
		}
	}

	async function abortMultipart(bucket: string, key: string, uploadId: string) {
		const response = await client.fetch(
			`${url(bucket, key)}?uploadId=${encodeURIComponent(uploadId)}`,
			{ method: 'DELETE' }
		);

		if (!response.ok && response.status !== 404) {
			throw await failure(response);
		}
	}

	return {
		async bucketExists(name) {
			const response = await client.fetch(url(name), { method: 'HEAD' });

			if (response.status === 404) {
				return false;
			}

			if (!response.ok) {
				throw await failure(response);
			}

			return true;
		},

		async createBucket(name) {
			const response = await client.fetch(url(name), { method: 'PUT' });

			if (!response.ok) {
				throw await failure(response);
			}
		},

		async putObject(bucket, key, body, contentType) {
			const response = await client.fetch(url(bucket, key), {
				method: 'PUT',
				headers: { 'Content-Type': contentType },
				body
			});

			if (!response.ok) {
				throw await failure(response);
			}
		},

		async getObject(bucket, key) {
			const response = await client.fetch(url(bucket, key));

			if (response.status === 404) {
				return null;
			}

			if (!response.ok) {
				throw await failure(response);
			}

			return response;
		},

		async deleteObject(bucket, key) {
			const response = await client.fetch(url(bucket, key), { method: 'DELETE' });

			if (!response.ok && response.status !== 404) {
				throw await failure(response);
			}
		},

		async getRange(bucket, key, start, end) {
			const response = await client.fetch(url(bucket, key), {
				headers: { Range: `bytes=${start}-${end - 1}` }
			});

			if (response.status === 404) {
				return null;
			}

			// The range starts at or after the end of the object.
			if (response.status === 416) {
				const size = Number(/\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1]);

				return { bytes: new Uint8Array(0), size: Number.isNaN(size) ? start : size };
			}

			if (!response.ok) {
				throw await failure(response);
			}

			const bytes = new Uint8Array(await response.arrayBuffer());

			// 200: the server ignored the range and sent everything.
			if (response.status === 200) {
				return { bytes: bytes.slice(start, end), size: bytes.byteLength };
			}

			const size = Number(/\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1]);

			return { bytes, size: Number.isNaN(size) ? start + bytes.byteLength : size };
		},

		startMultipart,
		uploadPart,
		completeMultipart,
		abortMultipart,

		async putStream(bucket, key, body, contentType) {
			const reader = body.getReader();
			let chunks: Uint8Array[] = [];
			let buffered = 0;
			let total = 0;
			let uploadId: string | null = null;
			const parts: string[] = [];

			async function flush() {
				uploadId ??= await startMultipart(bucket, key, contentType);
				parts.push(
					await uploadPart(bucket, key, uploadId, parts.length + 1, concat(chunks, buffered))
				);
				chunks = [];
				buffered = 0;
			}

			try {
				for (;;) {
					const { done, value } = await reader.read();

					if (done) {
						break;
					}

					chunks.push(value);
					buffered += value.byteLength;
					total += value.byteLength;

					if (buffered >= PART_SIZE) {
						await flush();
					}
				}

				// Small enough for a single request.
				if (!uploadId) {
					const response = await client.fetch(url(bucket, key), {
						method: 'PUT',
						headers: { 'Content-Type': contentType },
						body: concat(chunks, buffered)
					});

					if (!response.ok) {
						throw await failure(response);
					}

					return total;
				}

				if (buffered > 0) {
					await flush();
				}

				await completeMultipart(bucket, key, uploadId, parts);

				return total;
			} catch (error) {
				await reader.cancel().catch(() => undefined);

				if (uploadId) {
					await abortMultipart(bucket, key, uploadId).catch(() => undefined);
				}

				throw error;
			}
		},

		async listFolders(bucket, prefix) {
			const query = new URLSearchParams({ 'list-type': '2', delimiter: '/', prefix });
			const response = await client.fetch(`${url(bucket)}?${query}`);

			if (!response.ok) {
				throw await failure(response);
			}

			const body = await response.text();

			return Array.from(
				body.matchAll(/<CommonPrefixes>\s*<Prefix>([^<]*)<\/Prefix>/g),
				([, folder]) => decodeXml(folder)
			);
		}
	};
}
