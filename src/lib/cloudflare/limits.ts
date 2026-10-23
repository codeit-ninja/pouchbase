/**
 * Cloudflare plans, quotas and the arithmetic that turns usage totals into meters. Shared between
 * the server (which only reports raw totals) and the dashboard (which picks the plan's quotas), so
 * changing the plan never needs a new analytics request.
 *
 * Quotas follow https://developers.cloudflare.com/workers/platform/pricing/ and
 * https://developers.cloudflare.com/r2/pricing/ (checked 2026-10-21).
 */

import type { LimitTotals } from './types';

export const CLOUDFLARE_PLANS = ['free', 'paid'] as const;

export type CloudflarePlan = (typeof CLOUDFLARE_PLANS)[number];

export const PLAN_LABELS: Record<CloudflarePlan, string> = {
	free: 'Workers Free',
	paid: 'Workers Paid'
};

export const USAGE_RANGES = ['24h', '7d', '30d'] as const;

export type UsageRange = (typeof USAGE_RANGES)[number];

export const RANGE_LABELS: Record<UsageRange, string> = {
	'24h': 'Last 24 hours',
	'7d': 'Last 7 days',
	'30d': 'Last 30 days'
};

/** R2 operations that mutate or list state; billed as Class A. */
const R2_CLASS_A = new Set([
	'ListBuckets',
	'PutBucket',
	'ListObjects',
	'PutObject',
	'CopyObject',
	'CompleteMultipartUpload',
	'CreateMultipartUpload',
	'ListMultipartUploads',
	'UploadPart',
	'UploadPartCopy',
	'ListParts',
	'PutBucketEncryption',
	'PutBucketCors',
	'PutBucketLifecycleConfiguration'
]);

/** R2 operations that read existing state; billed as Class B. Deletes are free. */
const R2_CLASS_B = new Set([
	'HeadBucket',
	'HeadObject',
	'GetObject',
	'UsageSummary',
	'GetBucketEncryption',
	'GetBucketLocation',
	'GetBucketCors',
	'GetBucketLifecycleConfiguration'
]);

/** The billing class of an R2 `actionType`, or `null` for free operations such as deletes. */
export function r2OperationClass(actionType: string): 'A' | 'B' | null {
	if (R2_CLASS_A.has(actionType)) {
		return 'A';
	}

	if (R2_CLASS_B.has(actionType)) {
		return 'B';
	}

	return null;
}

export type QuotaId =
	| 'workers_requests'
	| 'workers_cpu'
	| 'd1_rows_read'
	| 'd1_rows_written'
	| 'd1_storage'
	| 'r2_storage'
	| 'r2_class_a'
	| 'r2_class_b';

/**
 * - `day`: resets at 00:00 UTC (the Free plan's daily limits).
 * - `month`: included usage per month. Cloudflare counts from the subscription renewal date; the
 *   dashboard approximates it with the current UTC calendar month.
 * - `total`: a cap on what is stored right now.
 */
export type QuotaWindow = 'day' | 'month' | 'total';

export type Quota = {
	id: QuotaId;
	product: 'workers' | 'd1' | 'r2';
	label: string;
	window: QuotaWindow;
	unit: 'count' | 'bytes' | 'ms';
	limit: number;
};

const GB = 1024 ** 3;

/** The R2 free tier is the same on both plans. */
const R2_QUOTAS: Quota[] = [
	{
		id: 'r2_storage',
		product: 'r2',
		label: 'R2 storage',
		window: 'month',
		unit: 'bytes',
		limit: 10 * GB
	},
	{
		id: 'r2_class_a',
		product: 'r2',
		label: 'R2 Class A operations',
		window: 'month',
		unit: 'count',
		limit: 1_000_000
	},
	{
		id: 'r2_class_b',
		product: 'r2',
		label: 'R2 Class B operations',
		window: 'month',
		unit: 'count',
		limit: 10_000_000
	}
];

const QUOTAS: Record<CloudflarePlan, Quota[]> = {
	free: [
		{
			id: 'workers_requests',
			product: 'workers',
			label: 'Worker requests',
			window: 'day',
			unit: 'count',
			limit: 100_000
		},
		{
			id: 'd1_rows_read',
			product: 'd1',
			label: 'D1 rows read',
			window: 'day',
			unit: 'count',
			limit: 5_000_000
		},
		{
			id: 'd1_rows_written',
			product: 'd1',
			label: 'D1 rows written',
			window: 'day',
			unit: 'count',
			limit: 100_000
		},
		{
			id: 'd1_storage',
			product: 'd1',
			label: 'D1 storage',
			window: 'total',
			unit: 'bytes',
			limit: 5 * GB
		},
		...R2_QUOTAS
	],
	paid: [
		{
			id: 'workers_requests',
			product: 'workers',
			label: 'Worker requests',
			window: 'month',
			unit: 'count',
			limit: 10_000_000
		},
		{
			id: 'workers_cpu',
			product: 'workers',
			label: 'Worker CPU time',
			window: 'month',
			unit: 'ms',
			limit: 30_000_000
		},
		{
			id: 'd1_rows_read',
			product: 'd1',
			label: 'D1 rows read',
			window: 'month',
			unit: 'count',
			limit: 25_000_000_000
		},
		{
			id: 'd1_rows_written',
			product: 'd1',
			label: 'D1 rows written',
			window: 'month',
			unit: 'count',
			limit: 50_000_000
		},
		{
			id: 'd1_storage',
			product: 'd1',
			label: 'D1 storage',
			window: 'total',
			unit: 'bytes',
			limit: 5 * GB
		},
		...R2_QUOTAS
	]
};

/** The quotas that apply to a plan; usage beyond them fails (Free) or is billed (Paid). */
export function quotasFor(plan: CloudflarePlan): Quota[] {
	return QUOTAS[plan];
}

export type MeterStatus = 'ok' | 'warning' | 'exceeded';

export type Meter = {
	quota: Quota;
	used: number;
	/** `used / limit`, not clamped. */
	ratio: number;
	status: MeterStatus;
};

/** Share of a quota from which a meter warns. */
export const WARNING_RATIO = 0.8;

function usedFor(quota: Quota, totals: LimitTotals): number {
	const window = quota.window === 'day' ? totals.today : totals.monthToDate;

	switch (quota.id) {
		case 'workers_requests':
			return window.workersRequests;
		case 'workers_cpu':
			return window.workersCpuMs;
		case 'd1_rows_read':
			return window.d1RowsRead;
		case 'd1_rows_written':
			return window.d1RowsWritten;
		case 'd1_storage':
			return totals.d1StorageBytes;
		case 'r2_storage':
			return totals.r2StorageBytes;
		case 'r2_class_a':
			return window.r2ClassA;
		case 'r2_class_b':
			return window.r2ClassB;
	}
}

/** Usage against each quota of the plan, in the order of the quota table. */
export function computeMeters(plan: CloudflarePlan, totals: LimitTotals): Meter[] {
	return quotasFor(plan).map((quota) => {
		const used = usedFor(quota, totals);
		const ratio = used / quota.limit;

		return {
			quota,
			used,
			ratio,
			status: ratio >= 1 ? 'exceeded' : ratio >= WARNING_RATIO ? 'warning' : 'ok'
		};
	});
}

export function windowLabel(window: QuotaWindow): string {
	switch (window) {
		case 'day':
			return 'Resets daily at 00:00 UTC';
		case 'month':
			return 'Per month, approximated with the calendar month';
		case 'total':
			return 'Stored right now';
	}
}
