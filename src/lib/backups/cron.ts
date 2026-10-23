/**
 * Five-field cron expressions (`minute hour day-of-month month day-of-week`), evaluated in UTC.
 * Fields accept `*`, numbers, ranges (`1-5`), lists (`1,15`) and steps (`*\/15`, `0-30/10`). As in
 * cron, a day matches when either day field matches if both are restricted.
 */

export type Cron = {
	minutes: Set<number>;
	hours: Set<number>;
	days: Set<number>;
	months: Set<number>;
	weekdays: Set<number>;
	/** Whether the day-of-month and day-of-week fields are `*`. */
	anyDay: boolean;
	anyWeekday: boolean;
};

const FIELDS = [
	{ min: 0, max: 59 },
	{ min: 0, max: 23 },
	{ min: 1, max: 31 },
	{ min: 1, max: 12 },
	// 7 is Sunday too.
	{ min: 0, max: 7 }
] as const;

/** Schedules offered in the UI; anything else is entered as a cron expression. */
export const CRON_PRESETS = [
	{ value: '0 * * * *', label: 'Every hour' },
	{ value: '0 */6 * * *', label: 'Every 6 hours' },
	{ value: '0 3 * * *', label: 'Every day at 03:00 UTC' },
	{ value: '0 3 * * 0', label: 'Every Sunday at 03:00 UTC' },
	{ value: '0 3 1 * *', label: 'On the 1st of every month at 03:00 UTC' }
] as const;

function parseField(value: string, { min, max }: { min: number; max: number }) {
	const values = new Set<number>();

	for (const part of value.split(',')) {
		const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);

		if (!match) {
			return null;
		}

		const [, range, stepText] = match;
		const step = stepText === undefined ? 1 : Number(stepText);
		let [from, to] = [min, max];

		if (range !== '*') {
			const [start, end] = range.split('-').map(Number);

			from = start;
			// `5/10` means from 5 to the end, like `5-59/10`.
			to = end ?? (stepText === undefined ? start : max);
		}

		if (step < 1 || from < min || to > max || from > to) {
			return null;
		}

		for (let current = from; current <= to; current += step) {
			values.add(current);
		}
	}

	return values;
}

/** The parsed expression, or `null` when it isn't valid. */
export function parseCron(expression: string): Cron | null {
	const parts = expression.trim().split(/\s+/);

	if (parts.length !== 5) {
		return null;
	}

	const fields = parts.map((part, index) => parseField(part, FIELDS[index]));

	if (fields.some((field) => !field)) {
		return null;
	}

	const [minutes, hours, days, months, weekdays] = fields as Set<number>[];

	if (weekdays.delete(7)) {
		weekdays.add(0);
	}

	return {
		minutes,
		hours,
		days,
		months,
		weekdays,
		anyDay: parts[2] === '*',
		anyWeekday: parts[4] === '*'
	};
}

function matchesDay(cron: Cron, date: Date) {
	const day = cron.days.has(date.getUTCDate());
	const weekday = cron.weekdays.has(date.getUTCDay());

	if (cron.anyDay && cron.anyWeekday) {
		return true;
	}

	if (cron.anyDay) {
		return weekday;
	}

	if (cron.anyWeekday) {
		return day;
	}

	return day || weekday;
}

/** The first time after `after` (to the minute) that the expression matches, within 5 years. */
export function nextRun(cron: Cron, after: Date): Date | null {
	const start = new Date(after);

	start.setUTCSeconds(0, 0);
	start.setUTCMinutes(start.getUTCMinutes() + 1);

	const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
	const hours = [...cron.hours].sort((a, b) => a - b);
	const minutes = [...cron.minutes].sort((a, b) => a - b);

	// Day by day, then the first matching hour and minute of that day.
	for (let index = 0; index < 366 * 5; index++) {
		if (cron.months.has(day.getUTCMonth() + 1) && matchesDay(cron, day)) {
			for (const hour of hours) {
				for (const minute of minutes) {
					const candidate = new Date(day);

					candidate.setUTCHours(hour, minute);

					if (candidate >= start) {
						return candidate;
					}
				}
			}
		}

		day.setUTCDate(day.getUTCDate() + 1);
	}

	return null;
}

/** A readable label for a preset, or the expression itself. */
export function describeCron(expression: string) {
	return CRON_PRESETS.find((preset) => preset.value === expression)?.label ?? `${expression} (UTC)`;
}
