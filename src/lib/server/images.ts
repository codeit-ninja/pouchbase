import type { ThumbnailSize } from '#lib/files/thumbnails.js';
import type { Adjustments, OutputFormat } from '#lib/files/image-edits.js';

import { crop, fliph, flipv, PhotonImage, resize, rotate, SamplingFilter } from '@cf-wasm/photon';
import {
	adjustPixels,
	clampAdjustments,
	DEFAULT_JPEG_QUALITY,
	defaultOutputFormat,
	isNeutral
} from '#lib/files/image-edits.js';

/**
 * Image processing with Photon (Rust compiled to WebAssembly). The `workerd` build of
 * `@cf-wasm/photon` loads its WASM as a module, so it runs on Cloudflare Workers; `vite dev` uses
 * the Node build. Functions throw on errors; services wrap them in results.
 */

/** Types Photon can decode and that are worth processing. */
const PROCESSABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Largest image processed, in pixels. A decoded image takes 4 bytes per pixel and Workers have
 * 128 MB of memory, so larger images are left alone.
 */
const MAX_PIXELS = 16_000_000;

export function canProcess(mimeType: string) {
	return PROCESSABLE.has(mimeType.toLowerCase());
}

/** Edits applied to an image, in this order. Crop and resize are in pixels of the result so far. */
export type ImageEdits = {
	/** Clockwise. */
	rotate?: 0 | 90 | 180 | 270;
	flipHorizontal?: boolean;
	flipVertical?: boolean;
	crop?: { x: number; y: number; width: number; height: number };
	resize?: { width: number; height: number };
	/** Color adjustments, applied last; see `#lib/files/image-edits.ts`. */
	adjustments?: Partial<Adjustments>;
	/** Defaults to the original format (GIFs become PNGs) at JPEG quality 85. */
	output?: { format?: OutputFormat; quality?: number };
};

export type EncodedImage = { bytes: Uint8Array; mimeType: string };

function decode(bytes: Uint8Array) {
	const image = PhotonImage.new_from_byteslice(bytes);

	if (image.get_width() * image.get_height() > MAX_PIXELS) {
		image.free();
		throw new Error(`Image is larger than ${MAX_PIXELS} pixels`);
	}

	return image;
}

/** Encodes in the original format where possible; GIFs become PNGs (first frame). */
function encode(
	image: PhotonImage,
	mimeType: string,
	quality = DEFAULT_JPEG_QUALITY
): EncodedImage {
	switch (mimeType.toLowerCase()) {
		case 'image/jpeg':
			return { bytes: image.get_bytes_jpeg(quality), mimeType: 'image/jpeg' };
		case 'image/webp':
			return { bytes: image.get_bytes_webp(), mimeType: 'image/webp' };
		default:
			return { bytes: image.get_bytes(), mimeType: 'image/png' };
	}
}

/** Runs `step` on `image` and frees the input when `step` returned a new image. */
function apply(image: PhotonImage, step: (input: PhotonImage) => PhotonImage | void) {
	const result = step(image);

	if (result && result !== image) {
		image.free();
		return result;
	}

	return image;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function thumbnail(bytes: Uint8Array, mimeType: string, size: ThumbnailSize): EncodedImage {
	let image = decode(bytes);

	try {
		const width = image.get_width();
		const height = image.get_height();

		if (size.mode === 'width' || size.mode === 'height' || size.mode === 'fit') {
			const scale =
				size.mode === 'width'
					? size.width / width
					: size.mode === 'height'
						? size.height / height
						: Math.min(size.width / width, size.height / height);

			// Never enlarge; small images keep their size.
			if (scale < 1) {
				image = apply(image, (input) =>
					resize(
						input,
						Math.max(1, Math.round(width * scale)),
						Math.max(1, Math.round(height * scale)),
						SamplingFilter.Lanczos3
					)
				);
			}

			return encode(image, mimeType);
		}

		// Crop modes: scale so the image covers the box, then cut the box out.
		const scale = Math.max(size.width / width, size.height / height);
		const scaledWidth = Math.max(size.width, Math.round(width * scale));
		const scaledHeight = Math.max(size.height, Math.round(height * scale));

		image = apply(image, (input) =>
			resize(input, scaledWidth, scaledHeight, SamplingFilter.Lanczos3)
		);

		const x = Math.floor((scaledWidth - size.width) / 2);
		const y =
			size.mode === 'top'
				? 0
				: size.mode === 'bottom'
					? scaledHeight - size.height
					: Math.floor((scaledHeight - size.height) / 2);

		image = apply(image, (input) => crop(input, x, y, x + size.width, y + size.height));

		return encode(image, mimeType);
	} finally {
		image.free();
	}
}

/** Color adjustments with the CSS filter formulas, so the editor's preview matches. */
function adjust(image: PhotonImage, adjustments: Adjustments) {
	const pixels = image.get_raw_pixels();

	adjustPixels(pixels, adjustments);

	return new PhotonImage(pixels, image.get_width(), image.get_height());
}

export function editImage(bytes: Uint8Array, mimeType: string, edits: ImageEdits): EncodedImage {
	let image = decode(bytes);

	try {
		if (edits.rotate) {
			const angle = edits.rotate;
			image = apply(image, (input) => rotate(input, angle));
		}

		if (edits.flipHorizontal) {
			fliph(image);
		}

		if (edits.flipVertical) {
			flipv(image);
		}

		if (edits.crop) {
			const width = image.get_width();
			const height = image.get_height();
			const x = clamp(Math.round(edits.crop.x), 0, width - 1);
			const y = clamp(Math.round(edits.crop.y), 0, height - 1);
			const right = clamp(Math.round(edits.crop.x + edits.crop.width), x + 1, width);
			const bottom = clamp(Math.round(edits.crop.y + edits.crop.height), y + 1, height);

			if (x > 0 || y > 0 || right < width || bottom < height) {
				image = apply(image, (input) => crop(input, x, y, right, bottom));
			}
		}

		if (edits.resize) {
			const width = clamp(Math.round(edits.resize.width), 1, 8000);
			const height = clamp(Math.round(edits.resize.height), 1, 8000);

			if (width * height > MAX_PIXELS) {
				throw new Error(`Resized image would be larger than ${MAX_PIXELS} pixels`);
			}

			if (width !== image.get_width() || height !== image.get_height()) {
				image = apply(image, (input) => resize(input, width, height, SamplingFilter.Lanczos3));
			}
		}

		const adjustments = clampAdjustments(edits.adjustments ?? {});

		if (!isNeutral(adjustments)) {
			image = apply(image, (input) => adjust(input, adjustments));
		}

		const format = edits.output?.format ?? defaultOutputFormat(mimeType);
		const quality = clamp(Math.round(edits.output?.quality ?? DEFAULT_JPEG_QUALITY), 1, 100);

		return encode(image, format, quality);
	} finally {
		image.free();
	}
}
