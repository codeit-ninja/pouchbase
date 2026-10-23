/**
 * A downloaded backup: an uncompressed tar archive (ustar) with `manifest.json`, `system.sql` and
 * `app.sql`, the files of the backup's folder in its destination. Tar needs no checksum over the
 * contents, so the server streams the files from the bucket straight into the download, and the
 * browser finds the files of an uploaded archive without reading all of it.
 */

export const ARCHIVE_FILES = ['manifest.json', 'system.sql', 'app.sql'] as const;

export type ArchiveFile = (typeof ARCHIVE_FILES)[number];

/** Files with the contents of a database, uploaded in parts. */
export const DATABASE_FILES = ['system.sql', 'app.sql'] as const;

export type DatabaseFile = (typeof DATABASE_FILES)[number];

/**
 * Uploads send database files in parts of this size: S3 needs at least 5 MiB per part (except the
 * last), and the Node server accepts request bodies of up to 16 MB.
 */
export const UPLOAD_PART_SIZE = 8 * 1024 * 1024;

const BLOCK = 512;

/** Largest file a ustar header can describe (11 octal digits). */
export const MAX_ARCHIVE_FILE_SIZE = 8 ** 11 - 1;

function octal(value: number, length: number) {
	return value.toString(8).padStart(length - 1, '0') + '\0';
}

/** Bytes after a file of this size up to the next block. */
export function tarPadding(size: number) {
	return (BLOCK - (size % BLOCK)) % BLOCK;
}

/** The 512-byte header before a file of `size` bytes. */
export function tarHeader(name: string, size: number, modified: Date) {
	if (size > MAX_ARCHIVE_FILE_SIZE) {
		throw new Error(`${name} is too large for a tar archive`);
	}

	const header = new Uint8Array(BLOCK);
	const encoder = new TextEncoder();

	function put(offset: number, text: string) {
		header.set(encoder.encode(text), offset);
	}

	put(0, name);
	put(100, octal(0o644, 8));
	put(108, octal(0, 8));
	put(116, octal(0, 8));
	put(124, octal(size, 12));
	put(136, octal(Math.floor(modified.getTime() / 1000), 12));
	// The checksum is computed with its own field as spaces.
	put(148, '        ');
	put(156, '0');
	put(257, 'ustar\0');
	put(263, '00');

	const checksum = header.reduce((total, byte) => total + byte, 0);
	put(148, checksum.toString(8).padStart(6, '0') + '\0 ');

	return header;
}

/** Two empty blocks end an archive. */
export function tarEnd() {
	return new Uint8Array(BLOCK * 2);
}

/** Total size of an archive with files of these sizes. */
export function tarSize(sizes: number[]) {
	return sizes.reduce((total, size) => total + BLOCK + size + tarPadding(size), 0) + BLOCK * 2;
}

export type ArchiveEntry = { name: string; offset: number; size: number };

/**
 * The files in an archive (where their contents start and how long they are), read from its
 * headers only. Names are without leading folders (`./app.sql` is `app.sql`).
 */
export async function readArchive(file: Blob): Promise<ArchiveEntry[]> {
	const decoder = new TextDecoder();
	const entries: ArchiveEntry[] = [];
	let offset = 0;

	while (offset + BLOCK <= file.size) {
		const header = new Uint8Array(await file.slice(offset, offset + BLOCK).arrayBuffer());

		// An empty block: the end.
		if (header.every((byte) => byte === 0)) {
			break;
		}

		const field = (start: number, length: number) =>
			decoder.decode(header.subarray(start, start + length)).replace(/\0.*$/s, '');

		const prefix = field(345, 155);
		const name = (prefix ? `${prefix}/` : '') + field(0, 100);
		const size = parseInt(field(124, 12).trim() || '0', 8);
		const type = field(156, 1);

		if (Number.isNaN(size)) {
			throw new Error('This is not a tar archive');
		}

		// Regular files only; folders and extended headers are skipped.
		if (type === '0' || type === '') {
			entries.push({ name: name.split('/').pop() ?? name, offset: offset + BLOCK, size });
		}

		offset += BLOCK + size + tarPadding(size);
	}

	return entries;
}
