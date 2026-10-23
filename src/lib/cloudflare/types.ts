/**
 * What the dashboard knows about the Cloudflare account this installation runs on. Produced by the
 * Cloudflare platform driver, passed through the Cloudflare service and its remote functions, and
 * rendered by the dashboard; shared here so both sides agree.
 */

import type { UsageRange } from './limits';

/**
 * A dashboard section either has its data or a reason it can't show it. Expected failures (the API
 * token lacks a permission, the installation doesn't run on Cloudflare) are values, so one section
 * never breaks the others; unexpected failures throw.
 */
export type SectionResult<T> =
	| { ok: true; data: T }
	| { ok: false; reason: 'forbidden'; permission: string; message: string }
	| { ok: false; reason: 'unavailable'; message: string };

/**
 * - `connected`: referenced by this installation and present on the account.
 * - `missing`: referenced by this installation but no longer on the account.
 * - `not_created`: this installation creates it when it is first needed.
 */
export type ResourceStatus = 'connected' | 'missing' | 'not_created';

export type D1Resource = {
	kind: 'd1';
	/** `system` is `pouchbase` (users, sessions, settings); `app` holds the collections' data. */
	role: 'system' | 'app';
	name: string | null;
	id: string | null;
	status: ResourceStatus;
	sizeBytes: number | null;
	tables: number | null;
	createdAt: string | null;
};

export type R2Resource = {
	kind: 'r2';
	role: 'files';
	name: string | null;
	status: ResourceStatus;
	createdAt: string | null;
	location: string | null;
};

/** A D1 database or R2 bucket on the account that does not belong to this installation. */
export type OtherResource = {
	kind: 'd1' | 'r2';
	name: string;
	createdAt: string | null;
};

export type CloudflareResources = {
	accountId: string;
	databases: D1Resource[];
	bucket: R2Resource;
	others: OtherResource[];
};

export type WorkerBinding = {
	name: string;
	/** Cloudflare binding type, e.g. `assets`, `secret_text`, `d1`, `r2_bucket`. */
	type: string;
};

export type WorkerInfo = {
	name: string;
	createdOn: string | null;
	modifiedOn: string | null;
	compatibilityDate: string | null;
	bindings: WorkerBinding[];
};

export type D1DatabaseUsage = {
	databaseId: string;
	/** Known for this installation's databases, `null` for other databases on the account. */
	name: string | null;
	rowsRead: number[];
	rowsWritten: number[];
};

/** Time series for the usage charts; every array has one entry per bucket, zero-filled. */
export type UsageSeries = {
	range: UsageRange;
	granularity: 'hour' | 'day';
	/** ISO start of each bucket, in UTC, oldest first. */
	buckets: string[];
	/** This installation's Worker only. */
	workers: {
		requests: number[];
		errors: number[];
		/** Median CPU time per request in milliseconds, `null` where the Worker had no requests. */
		cpuMsP50: (number | null)[];
	};
	/** Every database on the account, because the D1 limits are account-wide. */
	d1: {
		byDatabase: D1DatabaseUsage[];
		totals: { rowsRead: number[]; rowsWritten: number[] };
	};
	/** This installation's bucket only (every bucket when none has been created yet). */
	r2: {
		storageBytes: number[];
		objectCount: number[];
		classA: number[];
		classB: number[];
	};
};

/** Account-wide usage in a billing window, which is what Cloudflare's limits apply to. */
export type UsageTotals = {
	workersRequests: number;
	workersCpuMs: number;
	d1RowsRead: number;
	d1RowsWritten: number;
	r2ClassA: number;
	r2ClassB: number;
};

export type LimitTotals = {
	/** Since 00:00 UTC today. */
	today: UsageTotals;
	/** Since the first of the current month, 00:00 UTC. */
	monthToDate: UsageTotals;
	/** Sum of the latest size of every D1 database on the account. */
	d1StorageBytes: number;
	/** Sum of the latest size of every R2 bucket on the account. */
	r2StorageBytes: number;
	r2ObjectCount: number;
	computedAt: string;
};
