import type { FunctionLog, FunctionsDriver } from '../types';

import { api, cloudflareFetch, CloudflareApiError, failure } from './api';

/**
 * Function Workers through the Cloudflare REST API: the Workers Script Upload API for the code, the
 * Secrets API for secrets and the Workers Observability API for logs.
 */

/** Compatibility date of the function Workers; raise it together with the app's. */
const COMPATIBILITY_DATE = '2026-10-20';

/** How many log lines `logs` returns at most. */
const LOG_LIMIT = 200;

const LEVELS = new Set<FunctionLog['level']>(['debug', 'info', 'log', 'warn', 'error']);

// The subdomain belongs to the account and rarely changes, so it is looked up once per isolate.
let subdomain: Promise<string | null> | undefined;

function scriptPath(script: string, path = '') {
	return `/workers/scripts/${encodeURIComponent(script)}${path}`;
}

/** Cloudflare answers a missing Worker with 404 and error 10007. */
function isMissing(error: unknown) {
	return (
		error instanceof CloudflareApiError &&
		(error.status === 404 || error.errors.some((item) => item.code === 10007))
	);
}

interface TelemetryEvent {
	timestamp?: number;
	$metadata?: {
		id?: string;
		level?: string;
		message?: string;
		error?: string;
		requestId?: string;
	};
	$workers?: {
		requestId?: string;
		outcome?: string;
		event?: {
			request?: { method?: string; url?: string };
			response?: { status?: number };
		};
	};
}

/** A request's invocation log has no message of its own: describe the request instead. */
function describe(event: TelemetryEvent) {
	const { request, response } = event.$workers?.event ?? {};

	if (!request?.url) {
		return null;
	}

	const path = URL.canParse(request.url) ? new URL(request.url).pathname : request.url;
	const status = response?.status ? ` → ${response.status}` : '';
	const outcome =
		event.$workers?.outcome && event.$workers.outcome !== 'ok'
			? ` (${event.$workers.outcome})`
			: '';

	return `${request.method ?? 'GET'} ${path}${status}${outcome}`;
}

function toLog(event: TelemetryEvent, index: number): FunctionLog {
	const metadata = event.$metadata ?? {};
	const level = (metadata.error ? 'error' : metadata.level) as FunctionLog['level'];

	return {
		id: metadata.id ?? `${event.timestamp ?? 0}-${index}`,
		timestamp: event.timestamp ?? 0,
		level: LEVELS.has(level) ? level : 'log',
		message: metadata.message ?? metadata.error ?? describe(event) ?? '',
		requestId: metadata.requestId ?? event.$workers?.requestId ?? null
	};
}

export const functions: FunctionsDriver = {
	subdomain() {
		subdomain ??= api<{ subdomain?: string }>('/workers/subdomain').then(
			(result) => result.subdomain || null,
			(error) => {
				subdomain = undefined;

				// An account that never opened Workers & Pages has no subdomain yet.
				if (error instanceof CloudflareApiError && error.status === 404) {
					return null;
				}

				throw error;
			}
		);

		return subdomain;
	},

	async deploy(script, upload) {
		const metadata = {
			main_module: upload.mainModule,
			compatibility_date: COMPATIBILITY_DATE,
			compatibility_flags: ['nodejs_compat'],
			bindings: upload.bindings,
			// Secrets set through the Secrets API stay; the bindings above replace the rest.
			keep_bindings: ['secret_text'],
			observability: { enabled: true, logs: { enabled: true, invocation_logs: true } },
			annotations: { 'workers/message': upload.message }
		};

		const body = new FormData();
		body.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));

		for (const module of upload.modules) {
			body.set(
				module.name,
				new Blob([module.content], { type: 'application/javascript+module' }),
				module.name
			);
		}

		const response = await cloudflareFetch(scriptPath(script), { method: 'PUT', body });

		if (!response.ok) {
			throw await failure(response);
		}
	},

	async enableSubdomain(script) {
		await api(scriptPath(script, '/subdomain'), {
			method: 'POST',
			body: JSON.stringify({ enabled: true, previews_enabled: false })
		});
	},

	async delete(script) {
		try {
			await api(scriptPath(script, '?force=true'), { method: 'DELETE' });
		} catch (error) {
			if (!isMissing(error)) {
				throw error;
			}
		}
	},

	async secrets(script) {
		try {
			const result = await api<{ name: string; type: string }[]>(scriptPath(script, '/secrets'));

			return result.map((secret) => secret.name).sort();
		} catch (error) {
			if (isMissing(error)) {
				return [];
			}

			throw error;
		}
	},

	async putSecret(script, name, value) {
		await api(scriptPath(script, '/secrets'), {
			method: 'PUT',
			body: JSON.stringify({ name, text: value, type: 'secret_text' })
		});
	},

	async deleteSecret(script, name) {
		try {
			await api(scriptPath(script, `/secrets/${encodeURIComponent(name)}`), { method: 'DELETE' });
		} catch (error) {
			if (!isMissing(error)) {
				throw error;
			}
		}
	},

	async logs(script, since) {
		const result = await api<{ events?: { events?: TelemetryEvent[] } }>(
			'/workers/observability/telemetry/query',
			{
				method: 'POST',
				body: JSON.stringify({
					queryId: 'pouchbase-function-logs',
					timeframe: { from: since, to: Date.now() },
					view: 'events',
					limit: LOG_LIMIT,
					dry: true,
					parameters: {
						datasets: ['cloudflare-workers'],
						filters: [{ key: '$metadata.service', operation: 'eq', type: 'string', value: script }],
						filterCombination: 'and',
						orderBy: { value: 'timestamp', order: 'desc' },
						limit: LOG_LIMIT
					}
				})
			}
		);

		return (result.events?.events ?? []).map(toLog).sort((a, b) => b.timestamp - a.timestamp);
	}
};
