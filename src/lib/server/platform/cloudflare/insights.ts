import type { UsageRange } from '#lib/cloudflare/limits.js';
import type {
	CloudflareResources,
	D1DatabaseUsage,
	D1Resource,
	LimitTotals,
	OtherResource,
	UsageSeries,
	UsageTotals,
	WorkerInfo
} from '#lib/cloudflare/types.js';
import type { DatabaseInfo, InsightsDriver, InsightsInput } from '../types';

import { CLOUDFLARE_ACCOUNT_ID, POUCHBASE_INSTANCE } from '$app/env/private';

import { r2OperationClass } from '#lib/cloudflare/limits.js';

import { api, CloudflareApiError } from './api';
import { graphql } from './graphql';

/**
 * What the dashboard shows about the Cloudflare account: the resources of this installation and
 * the rest of the account (REST API), the Worker's bindings (REST API) and usage metrics (GraphQL
 * Analytics API). Responses are cached per isolate for a minute; the analytics data itself lags a
 * few minutes anyway, and the dashboard fires several of these calls per visit.
 */

/**
 * The Worker's name: the instance name, so a Worker deployed under another name (`wrangler deploy
 * --name`) sets `POUCHBASE_INSTANCE` to the same value.
 */
export const WORKER_NAME = POUCHBASE_INSTANCE;

const CACHE_TTL = 60_000;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

/** Shares one in-flight or recent promise per key; failures are not kept. */
function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);

	if (hit && hit.expires > Date.now()) {
		return hit.value as Promise<T>;
	}

	const value = loader();
	cache.set(key, { expires: Date.now() + CACHE_TTL, value });

	value.catch(() => {
		if (cache.get(key)?.value === value) {
			cache.delete(key);
		}
	});

	return value;
}

// --- REST: inventory -----------------------------------------------------------------------------

interface D1DatabaseInfo {
	uuid: string;
	name: string;
	created_at?: string;
	file_size?: number;
	num_tables?: number;
}

interface R2BucketInfo {
	name: string;
	creation_date?: string;
	location?: string;
}

interface WorkerScript {
	id: string;
	created_on?: string;
	modified_on?: string;
}

interface WorkerSettings {
	bindings?: { type: string; name: string }[];
	compatibility_date?: string;
}

/** `null` instead of an error when the resource does not exist. */
async function optional<T>(promise: Promise<T>): Promise<T | null> {
	try {
		return await promise;
	} catch (error) {
		if (error instanceof CloudflareApiError && error.status === 404) {
			return null;
		}

		throw error;
	}
}

function listDatabases() {
	return api<D1DatabaseInfo[]>('/d1/database?per_page=100');
}

function getDatabase(id: string) {
	return optional(api<D1DatabaseInfo>(`/d1/database/${encodeURIComponent(id)}`));
}

async function listBuckets() {
	const result = await api<{ buckets?: R2BucketInfo[] }>('/r2/buckets?per_page=1000');
	return result.buckets ?? [];
}

function getBucket(name: string) {
	return optional(api<R2BucketInfo>(`/r2/buckets/${encodeURIComponent(name)}`));
}

function listScripts() {
	return api<WorkerScript[]>('/workers/scripts');
}

function getScriptSettings(name: string) {
	return optional(api<WorkerSettings>(`/workers/scripts/${encodeURIComponent(name)}/settings`));
}

function d1Resource(
	role: D1Resource['role'],
	info: DatabaseInfo | null,
	details: D1DatabaseInfo | null
): D1Resource {
	return {
		kind: 'd1',
		role,
		name: info?.name ?? null,
		id: info?.id ?? null,
		status: !info ? 'not_created' : details ? 'connected' : 'missing',
		sizeBytes: details?.file_size ?? null,
		tables: details?.num_tables ?? null,
		createdAt: details?.created_at ?? null
	};
}

async function resources(input: InsightsInput): Promise<CloudflareResources> {
	const { systemDatabase, appDatabase, bucketName } = input;

	const [databases, buckets, system, app, bucket] = await Promise.all([
		listDatabases(),
		listBuckets(),
		systemDatabase ? getDatabase(systemDatabase.id) : null,
		appDatabase ? getDatabase(appDatabase.id) : null,
		bucketName ? getBucket(bucketName) : null
	]);

	const own = new Set([systemDatabase?.id, appDatabase?.id]);

	const others: OtherResource[] = [
		...databases
			.filter((database) => !own.has(database.uuid))
			.map((database): OtherResource => ({
				kind: 'd1',
				name: database.name,
				createdAt: database.created_at ?? null
			})),
		...buckets
			.filter((candidate) => candidate.name !== bucketName)
			.map((candidate): OtherResource => ({
				kind: 'r2',
				name: candidate.name,
				createdAt: candidate.creation_date ?? null
			}))
	];

	return {
		// Optional in the type because the variable is only required at runtime on Cloudflare.
		accountId: CLOUDFLARE_ACCOUNT_ID ?? '',
		databases: [d1Resource('system', systemDatabase, system), d1Resource('app', appDatabase, app)],
		bucket: {
			kind: 'r2',
			role: 'files',
			name: bucketName,
			status: !bucketName ? 'not_created' : bucket ? 'connected' : 'missing',
			createdAt: bucket?.creation_date ?? null,
			location: bucket?.location ?? null
		},
		others
	};
}

async function worker(): Promise<WorkerInfo | null> {
	const scripts = await listScripts();
	const script = scripts.find((candidate) => candidate.id === WORKER_NAME);

	if (!script) {
		return null;
	}

	const settings = await getScriptSettings(WORKER_NAME);

	return {
		name: WORKER_NAME,
		createdOn: script.created_on ?? null,
		modifiedOn: script.modified_on ?? null,
		compatibilityDate: settings?.compatibility_date ?? null,
		bindings: (settings?.bindings ?? []).map(({ name, type }) => ({ name, type }))
	};
}

// --- GraphQL: usage ------------------------------------------------------------------------------

type Grouped<Aggregates> = Aggregates & { dimensions: Record<string, string> };

type UsageResponse = {
	viewer: {
		accounts: {
			workers: Grouped<{
				sum: { requests: number; errors: number };
				quantiles: { cpuTimeP50: number };
			}>[];
			d1: Grouped<{ sum: { rowsRead: number; rowsWritten: number } }>[];
			r2Operations: Grouped<{ sum: { requests: number } }>[];
			r2Storage: Grouped<{
				max: { payloadSize: number; metadataSize: number; objectCount: number };
			}>[];
		}[];
	};
};

type Buckets = {
	granularity: UsageSeries['granularity'];
	/** GraphQL dimension that groups by bucket, and the scalar type of its filter. */
	dimension: 'datetimeHour' | 'date';
	scalar: 'Time' | 'Date';
	/** Filter value: an ISO timestamp for hours, `YYYY-MM-DD` for days. */
	since: string;
	keys: string[];
};

function isoDate(time: number) {
	return new Date(time).toISOString().slice(0, 10);
}

/** The buckets of a range, ending with the current hour or day (UTC). */
function bucketsFor(range: UsageRange, now = Date.now()): Buckets {
	if (range === '24h') {
		const start = Math.floor(now / HOUR) * HOUR - 23 * HOUR;
		const keys = Array.from({ length: 24 }, (_, i) => new Date(start + i * HOUR).toISOString());

		return { granularity: 'hour', dimension: 'datetimeHour', scalar: 'Time', since: keys[0], keys };
	}

	const days = range === '7d' ? 7 : 30;
	const start = Math.floor(now / DAY) * DAY - (days - 1) * DAY;
	const keys = Array.from({ length: days }, (_, i) => new Date(start + i * DAY).toISOString());

	return { granularity: 'day', dimension: 'date', scalar: 'Date', since: isoDate(start), keys };
}

/** The bucket key of a `datetimeHour` (`2026-10-21T12:00:00Z`) or `date` (`2026-10-21`) value. */
function bucketKey(value: string, granularity: UsageSeries['granularity']) {
	return new Date(granularity === 'day' ? `${value}T00:00:00Z` : value).toISOString();
}

function zeros(length: number) {
	return Array.from({ length }, () => 0);
}

async function usage(range: UsageRange, input: InsightsInput): Promise<UsageSeries> {
	const buckets = bucketsFor(range);
	const { dimension, scalar, keys, granularity } = buckets;
	const index = new Map(keys.map((key, i) => [key, i]));
	const at = (value: string) => index.get(bucketKey(value, granularity));

	const bucketFilter = input.bucketName ? ', bucketName: $bucket' : '';

	const query = `query Usage($account: string!, $script: string!, $since: ${scalar}!${input.bucketName ? ', $bucket: string!' : ''}) {
		viewer {
			accounts(filter: { accountTag: $account }) {
				workers: workersInvocationsAdaptive(limit: 10000, filter: { scriptName: $script, ${dimension}_geq: $since }) {
					sum { requests errors }
					quantiles { cpuTimeP50 }
					dimensions { ${dimension} }
				}
				d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { ${dimension}_geq: $since }) {
					sum { rowsRead rowsWritten }
					dimensions { databaseId ${dimension} }
				}
				r2Operations: r2OperationsAdaptiveGroups(limit: 10000, filter: { ${dimension}_geq: $since${bucketFilter} }) {
					sum { requests }
					dimensions { actionType ${dimension} }
				}
				r2Storage: r2StorageAdaptiveGroups(limit: 10000, filter: { ${dimension}_geq: $since${bucketFilter} }) {
					max { payloadSize metadataSize objectCount }
					dimensions { bucketName ${dimension} }
				}
			}
		}
	}`;

	const response = await graphql<UsageResponse>(query, {
		account: CLOUDFLARE_ACCOUNT_ID,
		script: WORKER_NAME,
		since: buckets.since,
		...(input.bucketName ? { bucket: input.bucketName } : {})
	});

	const account = response.viewer.accounts[0];

	// Workers
	const requests = zeros(keys.length);
	const errors = zeros(keys.length);
	const cpuMsP50: (number | null)[] = keys.map(() => null);

	for (const row of account?.workers ?? []) {
		const i = at(row.dimensions[dimension]);

		if (i === undefined) {
			continue;
		}

		requests[i] += row.sum.requests;
		errors[i] += row.sum.errors;
		// Microseconds in the API; one row per bucket, so the last one wins.
		cpuMsP50[i] = row.quantiles.cpuTimeP50 / 1000;
	}

	// D1, per database
	const names = new Map<string, string>();

	for (const database of [input.systemDatabase, input.appDatabase]) {
		if (database) {
			names.set(database.id, database.name);
		}
	}

	const byDatabase = new Map<string, D1DatabaseUsage>();
	const totals = { rowsRead: zeros(keys.length), rowsWritten: zeros(keys.length) };

	for (const row of account?.d1 ?? []) {
		const i = at(row.dimensions[dimension]);

		if (i === undefined) {
			continue;
		}

		const id = row.dimensions.databaseId;
		let database = byDatabase.get(id);

		if (!database) {
			database = {
				databaseId: id,
				name: names.get(id) ?? null,
				rowsRead: zeros(keys.length),
				rowsWritten: zeros(keys.length)
			};
			byDatabase.set(id, database);
		}

		database.rowsRead[i] += row.sum.rowsRead;
		database.rowsWritten[i] += row.sum.rowsWritten;
		totals.rowsRead[i] += row.sum.rowsRead;
		totals.rowsWritten[i] += row.sum.rowsWritten;
	}

	const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

	// This installation's databases first, then the busiest others.
	const databases = [...byDatabase.values()].sort((a, b) => {
		const ownA = names.has(a.databaseId) ? 0 : 1;
		const ownB = names.has(b.databaseId) ? 0 : 1;

		return (
			ownA - ownB || sum(b.rowsRead) + sum(b.rowsWritten) - sum(a.rowsRead) - sum(a.rowsWritten)
		);
	});

	// R2 operations by billing class
	const classA = zeros(keys.length);
	const classB = zeros(keys.length);

	for (const row of account?.r2Operations ?? []) {
		const i = at(row.dimensions[dimension]);
		const billing = r2OperationClass(row.dimensions.actionType);

		if (i === undefined || !billing) {
			continue;
		}

		(billing === 'A' ? classA : classB)[i] += row.sum.requests;
	}

	// R2 storage: the API samples it, so buckets without a sample keep the previous value.
	const storageSamples: (number | null)[] = keys.map(() => null);
	const objectSamples: (number | null)[] = keys.map(() => null);

	for (const row of account?.r2Storage ?? []) {
		const i = at(row.dimensions[dimension]);

		if (i === undefined) {
			continue;
		}

		storageSamples[i] = (storageSamples[i] ?? 0) + row.max.payloadSize + row.max.metadataSize;
		objectSamples[i] = (objectSamples[i] ?? 0) + row.max.objectCount;
	}

	const forwardFill = (samples: (number | null)[]) => {
		let last = 0;

		return samples.map((sample) => {
			last = sample ?? last;
			return last;
		});
	};

	return {
		range,
		granularity,
		buckets: keys,
		workers: { requests, errors, cpuMsP50 },
		d1: { byDatabase: databases, totals },
		r2: {
			storageBytes: forwardFill(storageSamples),
			objectCount: forwardFill(objectSamples),
			classA,
			classB
		}
	};
}

// --- GraphQL: usage against the limits -----------------------------------------------------------

type LimitsResponse = {
	viewer: {
		accounts: {
			workers: Grouped<{ sum: { requests: number; cpuTimeUs: number } }>[];
			d1: Grouped<{ sum: { rowsRead: number; rowsWritten: number } }>[];
			r2Operations: Grouped<{ sum: { requests: number } }>[];
			r2Storage: Grouped<{
				max: { payloadSize: number; metadataSize: number; objectCount: number };
			}>[];
			d1Storage: Grouped<{ max: { databaseSizeBytes: number } }>[];
		}[];
	};
};

const LIMITS_QUERY = `query Limits($account: string!, $monthStart: Date!, $recent: Date!) {
	viewer {
		accounts(filter: { accountTag: $account }) {
			workers: workersInvocationsAdaptive(limit: 10000, filter: { date_geq: $monthStart }) {
				sum { requests cpuTimeUs }
				dimensions { date }
			}
			d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $monthStart }) {
				sum { rowsRead rowsWritten }
				dimensions { date }
			}
			r2Operations: r2OperationsAdaptiveGroups(limit: 10000, filter: { date_geq: $monthStart }) {
				sum { requests }
				dimensions { actionType date }
			}
			r2Storage: r2StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $recent }) {
				max { payloadSize metadataSize objectCount }
				dimensions { bucketName }
			}
			d1Storage: d1StorageAdaptiveGroups(limit: 10000, filter: { date_geq: $recent }) {
				max { databaseSizeBytes }
				dimensions { databaseId }
			}
		}
	}
}`;

function emptyTotals(): UsageTotals {
	return {
		workersRequests: 0,
		workersCpuMs: 0,
		d1RowsRead: 0,
		d1RowsWritten: 0,
		r2ClassA: 0,
		r2ClassB: 0
	};
}

/** Account-wide usage since the start of the UTC day and month, plus what is stored right now. */
async function limitTotals(): Promise<LimitTotals> {
	const now = new Date();
	const today = isoDate(now.getTime());
	const monthStart = isoDate(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	// Storage is sampled a few times a day; look back a day so every bucket and database has one.
	const recent = isoDate(now.getTime() - DAY);

	const response = await graphql<LimitsResponse>(LIMITS_QUERY, {
		account: CLOUDFLARE_ACCOUNT_ID,
		monthStart,
		recent
	});

	const account = response.viewer.accounts[0];
	const totals = { today: emptyTotals(), monthToDate: emptyTotals() };

	const windows = (date: string) =>
		date === today ? [totals.today, totals.monthToDate] : [totals.monthToDate];

	for (const row of account?.workers ?? []) {
		for (const window of windows(row.dimensions.date)) {
			window.workersRequests += row.sum.requests;
			window.workersCpuMs += row.sum.cpuTimeUs / 1000;
		}
	}

	for (const row of account?.d1 ?? []) {
		for (const window of windows(row.dimensions.date)) {
			window.d1RowsRead += row.sum.rowsRead;
			window.d1RowsWritten += row.sum.rowsWritten;
		}
	}

	for (const row of account?.r2Operations ?? []) {
		const billing = r2OperationClass(row.dimensions.actionType);

		if (!billing) {
			continue;
		}

		for (const window of windows(row.dimensions.date)) {
			if (billing === 'A') {
				window.r2ClassA += row.sum.requests;
			} else {
				window.r2ClassB += row.sum.requests;
			}
		}
	}

	let r2StorageBytes = 0;
	let r2ObjectCount = 0;

	for (const row of account?.r2Storage ?? []) {
		r2StorageBytes += row.max.payloadSize + row.max.metadataSize;
		r2ObjectCount += row.max.objectCount;
	}

	let d1StorageBytes = 0;

	for (const row of account?.d1Storage ?? []) {
		d1StorageBytes += row.max.databaseSizeBytes;
	}

	return {
		...totals,
		d1StorageBytes,
		r2StorageBytes,
		r2ObjectCount,
		computedAt: now.toISOString()
	};
}

export const insights: InsightsDriver = {
	resources(input) {
		return cached(`resources:${JSON.stringify(input)}`, () => resources(input));
	},

	worker() {
		return cached('worker', worker);
	},

	usage(range, input) {
		return cached(`usage:${range}:${JSON.stringify(input)}`, () => usage(range, input));
	},

	limitTotals() {
		return cached('limits', limitTotals);
	}
};
