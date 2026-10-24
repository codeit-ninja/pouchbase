import { error } from '@sveltejs/kit';
import { isPluginCategory } from '@pouchbasejs/plugin-sdk';

import type { PageServerLoad } from './$types';

import { RegistryFailure, searchPlugins } from '#lib/server/registry.js';

const PER_PAGE = 24;

/**
 * The public plugin directory: the registry's `searchPlugins`, driven by `?q=&category=&page=` so
 * a search or filter can be shared as a link. An unknown category or page shows everything.
 */
export const load: PageServerLoad = async ({ url, setHeaders }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const categoryParam = url.searchParams.get('category');
	const category = isPluginCategory(categoryParam) ? categoryParam : null;
	const pageParam = Number(url.searchParams.get('page') ?? 1);
	const page = Number.isSafeInteger(pageParam) && pageParam > 0 ? pageParam : 1;

	try {
		const list = await searchPlugins({
			query: query || undefined,
			category: category ?? undefined,
			page,
			perPage: PER_PAGE,
			apiVersions: []
		});

		setHeaders({ 'Cache-Control': 'public, max-age=60' });

		return {
			query,
			category,
			plugins: list.items,
			page,
			total: list.total,
			totalPages: Math.max(1, Math.ceil(list.total / PER_PAGE))
		};
	} catch (cause) {
		if (cause instanceof RegistryFailure) {
			error(cause.status, cause.message);
		}

		throw cause;
	}
};
