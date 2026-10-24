/**
 * Series colours, assigned in a fixed order by the caller: `primary` for the first series,
 * `secondary` for the second, `tertiary` for the third. `danger` is reserved for errors and
 * `neutral` for an "other" remainder. The chart hues are theme tokens in `packages/ui/src/theme.css`.
 */
export type SeriesColor = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'neutral';

export const fills: Record<SeriesColor, string> = {
	primary: 'bg-chart-1',
	secondary: 'bg-chart-2',
	tertiary: 'bg-chart-3',
	danger: 'bg-red-500',
	neutral: 'bg-zinc-400'
};

export const strokes: Record<SeriesColor, string> = {
	primary: 'stroke-chart-1',
	secondary: 'stroke-chart-2',
	tertiary: 'stroke-chart-3',
	danger: 'stroke-red-500',
	neutral: 'stroke-zinc-400'
};

/** Area washes: the series hue at low opacity. */
export const washes: Record<SeriesColor, string> = {
	primary: 'fill-chart-1/15',
	secondary: 'fill-chart-2/15',
	tertiary: 'fill-chart-3/15',
	danger: 'fill-red-500/15',
	neutral: 'fill-zinc-400/15'
};
