import type { StorageDriver } from '../types';

import { api, cloudflareFetch, failure } from './api';

/** R2 through the Cloudflare REST API (the same endpoints `wrangler r2 object` uses). */

function objectPath(bucket: string, key: string) {
	return `/r2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(key)}`;
}

export const storage: StorageDriver = {
	async bucketExists(name) {
		const response = await cloudflareFetch(`/r2/buckets/${encodeURIComponent(name)}`);

		if (response.status === 404) {
			return false;
		}

		if (!response.ok) {
			throw await failure(response);
		}

		return true;
	},

	async createBucket(name) {
		await api<{ name: string }>('/r2/buckets', { method: 'POST', body: JSON.stringify({ name }) });
	},

	async putObject(bucket, key, body, contentType) {
		const response = await cloudflareFetch(objectPath(bucket, key), {
			method: 'PUT',
			headers: { 'Content-Type': contentType },
			body
		});

		if (!response.ok) {
			throw await failure(response);
		}
	},

	async getObject(bucket, key) {
		const response = await cloudflareFetch(objectPath(bucket, key));

		if (response.status === 404) {
			return null;
		}

		if (!response.ok) {
			throw await failure(response);
		}

		return response;
	},

	async deleteObject(bucket, key) {
		const response = await cloudflareFetch(objectPath(bucket, key), { method: 'DELETE' });

		if (!response.ok && response.status !== 404) {
			throw await failure(response);
		}
	}
};
