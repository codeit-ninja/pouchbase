/**
 * Thumbnail sizes in PocketBase syntax:
 *
 * - `WxH`  crop to fill W×H, centered (e.g. `100x100`)
 * - `WxHt` crop to fill W×H from the top
 * - `WxHb` crop to fill W×H from the bottom
 * - `WxHf` fit inside W×H without cropping
 * - `Wx0`  scale to width W, keeping the aspect ratio
 * - `0xH`  scale to height H, keeping the aspect ratio
 */

export type ThumbnailMode = 'crop' | 'top' | 'bottom' | 'fit' | 'width' | 'height';

export type ThumbnailSize = {
	/** The size as written, e.g. `100x100f`; also used in URLs (`?thumb=100x100f`). */
	spec: string;
	width: number;
	height: number;
	mode: ThumbnailMode;
};

/** Largest thumbnail side. */
export const MAX_THUMBNAIL_SIDE = 4000;

const PATTERN = /^(\d{1,4})x(\d{1,4})([tbf])?$/;

export function parseThumbnailSize(spec: string): ThumbnailSize | null {
	const match = PATTERN.exec(spec.trim().toLowerCase());

	if (!match) {
		return null;
	}

	const width = Number(match[1]);
	const height = Number(match[2]);
	const suffix = match[3];

	if ((!width && !height) || width > MAX_THUMBNAIL_SIDE || height > MAX_THUMBNAIL_SIDE) {
		return null;
	}

	if (!width || !height) {
		// `Wx0` and `0xH` scale on one side; a crop/fit suffix makes no sense there.
		return suffix
			? null
			: { spec: `${width}x${height}`, width, height, mode: width ? 'width' : 'height' };
	}

	const mode: ThumbnailMode =
		suffix === 'f' ? 'fit' : suffix === 't' ? 'top' : suffix === 'b' ? 'bottom' : 'crop';

	return { spec: `${width}x${height}${suffix ?? ''}`, width, height, mode };
}

/** Splits a list like `100x100, 300x0` (commas or new lines) into specs. */
export function splitThumbnailSizes(value: string) {
	return [
		...new Set(
			value
				.split(/[\s,]+/)
				.map((spec) => spec.trim().toLowerCase())
				.filter(Boolean)
		)
	];
}

export type ThumbnailSettings = {
	enabled: boolean;
	/** Specs, e.g. `['100x100', '300x0']`. */
	sizes: string[];
};

/** Settings of a collection; sections only apply to some collections (thumbnails: `files`). */
export type CollectionSettings = {
	thumbnails?: ThumbnailSettings;
};

/**
 * The configured size closest to `target` pixels wide, for previews; `null` when thumbnails are
 * off or none fits.
 */
export function previewThumbnail(settings: ThumbnailSettings | undefined, target: number) {
	if (!settings?.enabled) {
		return null;
	}

	const sizes = settings.sizes
		.map(parseThumbnailSize)
		.filter(
			(size): size is ThumbnailSize => !!size && size.mode !== 'height' && size.width >= target / 2
		)
		.sort((a, b) => Math.abs(a.width - target) - Math.abs(b.width - target));

	return sizes[0]?.spec ?? null;
}
