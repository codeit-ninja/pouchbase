/** Number and date formatting for the Cloudflare overview; compact, in English. */

import type { Quota } from './limits';

/** Compact count: 1,284 → 1.3K, 5,000,000 → 5M, 25,000,000,000 → 25B. */
export function formatCount(value: number): string {
	const units: [number, string][] = [
		[1_000_000_000, 'B'],
		[1_000_000, 'M'],
		[1_000, 'K']
	];

	for (const [size, suffix] of units) {
		if (value >= size) {
			const scaled = value / size;
			return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}${suffix}`;
		}
	}

	return Math.round(value).toLocaleString('en-US');
}

export function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;

	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}

	return `${unit === 0 ? Math.round(value) : Number(value.toFixed(1))} ${units[unit]}`;
}

/** Milliseconds of CPU time, compact: 1,500 → 1.5 s, 90,000,000 → 25 h. */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Number(ms.toFixed(ms < 10 ? 1 : 0))} ms`;
	}

	if (ms < 60_000) {
		return `${Number((ms / 1000).toFixed(1))} s`;
	}

	if (ms < 3_600_000) {
		return `${Number((ms / 60_000).toFixed(1))} min`;
	}

	return `${Number((ms / 3_600_000).toFixed(1))} h`;
}

export function formatQuotaValue(quota: Pick<Quota, 'unit'>, value: number): string {
	switch (quota.unit) {
		case 'bytes':
			return formatBytes(value);
		case 'ms':
			return formatDuration(value);
		case 'count':
			return formatCount(value);
	}
}

export function formatPercent(ratio: number): string {
	const percent = ratio * 100;

	return `${percent > 0 && percent < 1 ? '<1' : Math.round(percent)}%`;
}

/** `Oct 21, 2026` for an ISO timestamp; `—` when unknown. */
export function formatDate(iso: string | null): string {
	if (!iso) {
		return '—';
	}

	return new Date(iso).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/** Axis label of a chart bucket: `14:00` for hours (UTC), `Oct 21` for days. */
export function formatBucket(iso: string, granularity: 'hour' | 'day'): string {
	const date = new Date(iso);

	if (granularity === 'hour') {
		return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
	}

	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
