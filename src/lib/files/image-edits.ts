/**
 * Color adjustments of the image editor, shared by the browser preview (CSS `filter`) and the
 * server (pixel math). Both use the formulas of the CSS filter functions, applied in the same order
 * and in sRGB, so the saved image matches the preview.
 */

export type Adjustments = {
	/** -100..100; 0 keeps the image as is. CSS `brightness()`. */
	brightness: number;
	/** -100..100. CSS `contrast()`. */
	contrast: number;
	/** -100..100; -100 removes all color. CSS `saturate()`. */
	saturation: number;
	/** -180..180 degrees. CSS `hue-rotate()`. */
	hue: number;
	/** 0..100. CSS `grayscale()`. */
	grayscale: number;
	/** 0..100. CSS `sepia()`. */
	sepia: number;
};

export const NEUTRAL_ADJUSTMENTS: Adjustments = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	hue: 0,
	grayscale: 0,
	sepia: 0
};

export const ADJUSTMENT_RANGES: Record<keyof Adjustments, { min: number; max: number }> = {
	brightness: { min: -100, max: 100 },
	contrast: { min: -100, max: 100 },
	saturation: { min: -100, max: 100 },
	hue: { min: -180, max: 180 },
	grayscale: { min: 0, max: 100 },
	sepia: { min: 0, max: 100 }
};

/** One-click looks; each sets every adjustment, so they can be fine-tuned afterwards. */
export const FILTER_PRESETS: { name: string; adjustments: Adjustments }[] = [
	{ name: 'Original', adjustments: NEUTRAL_ADJUSTMENTS },
	{ name: 'Vivid', adjustments: { ...NEUTRAL_ADJUSTMENTS, contrast: 15, saturation: 45 } },
	{
		name: 'Fade',
		adjustments: { ...NEUTRAL_ADJUSTMENTS, brightness: 10, contrast: -25, saturation: -30 }
	},
	{ name: 'Mono', adjustments: { ...NEUTRAL_ADJUSTMENTS, contrast: 10, grayscale: 100 } },
	{
		name: 'Noir',
		adjustments: { ...NEUTRAL_ADJUSTMENTS, brightness: -10, contrast: 45, grayscale: 100 }
	},
	{ name: 'Sepia', adjustments: { ...NEUTRAL_ADJUSTMENTS, sepia: 80 } },
	{
		name: 'Vintage',
		adjustments: {
			...NEUTRAL_ADJUSTMENTS,
			brightness: 5,
			contrast: -10,
			saturation: -20,
			sepia: 40
		}
	},
	{ name: 'Cool', adjustments: { ...NEUTRAL_ADJUSTMENTS, saturation: -10, hue: -12 } },
	{ name: 'Warm', adjustments: { ...NEUTRAL_ADJUSTMENTS, saturation: 10, sepia: 20 } }
];

export function isNeutral(adjustments: Adjustments) {
	return (Object.keys(NEUTRAL_ADJUSTMENTS) as (keyof Adjustments)[]).every(
		(key) => adjustments[key] === NEUTRAL_ADJUSTMENTS[key]
	);
}

export function sameAdjustments(a: Adjustments, b: Adjustments) {
	return (Object.keys(NEUTRAL_ADJUSTMENTS) as (keyof Adjustments)[]).every(
		(key) => a[key] === b[key]
	);
}

/** The CSS `filter` for the preview; the order matches `adjustPixels`. */
export function cssFilter(adjustments: Adjustments) {
	const { brightness, contrast, saturation, hue, grayscale, sepia } = adjustments;

	return [
		`brightness(${1 + brightness / 100})`,
		`contrast(${1 + contrast / 100})`,
		`saturate(${1 + saturation / 100})`,
		`hue-rotate(${hue}deg)`,
		`grayscale(${grayscale / 100})`,
		`sepia(${sepia / 100})`
	].join(' ');
}

type Matrix = [number, number, number, number, number, number, number, number, number];

// The color matrices of the Filter Effects spec (https://drafts.fxtf.org/filter-effects/).
function saturateMatrix(s: number): Matrix {
	return [
		0.213 + 0.787 * s,
		0.715 - 0.715 * s,
		0.072 - 0.072 * s,
		0.213 - 0.213 * s,
		0.715 + 0.285 * s,
		0.072 - 0.072 * s,
		0.213 - 0.213 * s,
		0.715 - 0.715 * s,
		0.072 + 0.928 * s
	];
}

function hueRotateMatrix(degrees: number): Matrix {
	const angle = (degrees * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	return [
		0.213 + cos * 0.787 - sin * 0.213,
		0.715 - cos * 0.715 - sin * 0.715,
		0.072 - cos * 0.072 + sin * 0.928,
		0.213 - cos * 0.213 + sin * 0.143,
		0.715 + cos * 0.285 + sin * 0.14,
		0.072 - cos * 0.072 - sin * 0.283,
		0.213 - cos * 0.213 - sin * 0.787,
		0.715 - cos * 0.715 + sin * 0.715,
		0.072 + cos * 0.928 + sin * 0.072
	];
}

function grayscaleMatrix(amount: number): Matrix {
	const s = 1 - amount;

	return [
		0.2126 + 0.7874 * s,
		0.7152 - 0.7152 * s,
		0.0722 - 0.0722 * s,
		0.2126 - 0.2126 * s,
		0.7152 + 0.2848 * s,
		0.0722 - 0.0722 * s,
		0.2126 - 0.2126 * s,
		0.7152 - 0.7152 * s,
		0.0722 + 0.9278 * s
	];
}

function sepiaMatrix(amount: number): Matrix {
	const s = 1 - amount;

	return [
		0.393 + 0.607 * s,
		0.769 - 0.769 * s,
		0.189 - 0.189 * s,
		0.349 - 0.349 * s,
		0.686 + 0.314 * s,
		0.168 - 0.168 * s,
		0.272 - 0.272 * s,
		0.534 - 0.534 * s,
		0.131 + 0.869 * s
	];
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

/** Clamps every adjustment to its range, e.g. for values that came over the network. */
export function clampAdjustments(adjustments: Partial<Adjustments>): Adjustments {
	const result = { ...NEUTRAL_ADJUSTMENTS };

	for (const key of Object.keys(NEUTRAL_ADJUSTMENTS) as (keyof Adjustments)[]) {
		const { min, max } = ADJUSTMENT_RANGES[key];
		result[key] = clamp(adjustments[key] ?? NEUTRAL_ADJUSTMENTS[key], min, max);
	}

	return result;
}

/**
 * Applies `adjustments` to RGBA pixels in place. Like the CSS filter chain, every step clamps its
 * output to 0..255 before the next one runs.
 */
export function adjustPixels(pixels: Uint8Array | Uint8ClampedArray, adjustments: Adjustments) {
	const { brightness, contrast, saturation, hue, grayscale, sepia } = adjustments;
	const b = 1 + brightness / 100;
	const c = 1 + contrast / 100;
	const matrices: Matrix[] = [];

	if (saturation) {
		matrices.push(saturateMatrix(1 + saturation / 100));
	}

	if (hue) {
		matrices.push(hueRotateMatrix(hue));
	}

	if (grayscale) {
		matrices.push(grayscaleMatrix(grayscale / 100));
	}

	if (sepia) {
		matrices.push(sepiaMatrix(sepia / 100));
	}

	for (let index = 0; index < pixels.length; index += 4) {
		let red = pixels[index];
		let green = pixels[index + 1];
		let blue = pixels[index + 2];

		if (b !== 1) {
			red = clamp(red * b, 0, 255);
			green = clamp(green * b, 0, 255);
			blue = clamp(blue * b, 0, 255);
		}

		if (c !== 1) {
			red = clamp((red - 127.5) * c + 127.5, 0, 255);
			green = clamp((green - 127.5) * c + 127.5, 0, 255);
			blue = clamp((blue - 127.5) * c + 127.5, 0, 255);
		}

		for (const m of matrices) {
			const r = clamp(m[0] * red + m[1] * green + m[2] * blue, 0, 255);
			const g = clamp(m[3] * red + m[4] * green + m[5] * blue, 0, 255);
			const bl = clamp(m[6] * red + m[7] * green + m[8] * blue, 0, 255);

			red = r;
			green = g;
			blue = bl;
		}

		pixels[index] = Math.round(red);
		pixels[index + 1] = Math.round(green);
		pixels[index + 2] = Math.round(blue);
	}
}

/** Formats an edited image can be saved as. */
export type OutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export const OUTPUT_FORMATS: { value: OutputFormat; label: string }[] = [
	{ value: 'image/jpeg', label: 'JPEG' },
	{ value: 'image/png', label: 'PNG' },
	{ value: 'image/webp', label: 'WebP' }
];

/** The format an image is saved in when none is chosen; GIFs become PNGs (first frame). */
export function defaultOutputFormat(mimeType: string): OutputFormat {
	const type = mimeType.toLowerCase();

	return type === 'image/jpeg' || type === 'image/webp' ? type : 'image/png';
}

export const DEFAULT_JPEG_QUALITY = 85;
