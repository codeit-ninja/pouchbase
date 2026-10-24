import { addIcon } from '@iconify/svelte';

/**
 * `gg:spinner-alt` with rounded ends.
 *
 * The original is a filled quarter ring (`M2 12C2 6.477 6.477 2 12 2v3a7 7 0 0 0-7 7z`, radius 7–10).
 * Here it is drawn as a stroke along the centre line (radius 8.5, width 3) so the ends can use
 * `stroke-linecap="round"`. Registered offline, so Iconify never fetches it from its API.
 */
export const SPINNER_ICON = 'pouchbase:spinner';

addIcon(SPINNER_ICON, {
	width: 24,
	height: 24,
	body: '<path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M3.5 12A8.5 8.5 0 0 1 12 3.5"/>'
});
