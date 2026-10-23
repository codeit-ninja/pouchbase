import type { Pouchbase } from '../client.js';

/** Options for `pb.files.url()`. */
export type FileUrlOptions = {
	/**
	 * A thumbnail size such as `100x100`. Only sizes configured on the `files`
	 * collection are served; for others the original is returned.
	 */
	thumb?: string;
	/** Serve the file as a download instead of inline. */
	download?: boolean;
};

/** Files of the built-in `files` collection. Files are public; their ids are random. */
export class FilesService {
	readonly #pb: Pouchbase<object>;

	constructor(pb: Pouchbase<object>) {
		this.#pb = pb;
	}

	/** URL of a file (`GET /api/files/<id>`), for an `<img src>` or a download link. */
	url(file: string | { id: string }, options: FileUrlOptions = {}): string {
		const id = typeof file === 'string' ? file : file.id;

		return this.#pb.buildUrl(`/api/files/${encodeURIComponent(id)}`, {
			thumb: options.thumb || undefined,
			download: options.download ? 1 : undefined
		});
	}
}
