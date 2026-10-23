import { resolve } from '$app/paths';

export const GITHUB_URL = 'https://github.com/pouchbase/pouchbase';

export interface NavLink {
	label: string;
	href: string;
	/** Iconify name, literal so `vite/iconify.ts` can bundle it. */
	icon?: string;
	description?: string;
}

export interface NavGroup {
	label: string;
	links: NavLink[];
}

/** Top-level entries; a group renders as a dropdown, a link as a plain item. */
export const navigation: (NavGroup | NavLink)[] = [
	{
		label: 'Product',
		links: [
			{
				label: 'Collections',
				href: `${resolve('/')}#collections`,
				icon: 'lucide:database',
				description: 'Model your data in the admin interface.'
			},
			{
				label: 'Users and sign-in',
				href: `${resolve('/')}#authentication`,
				icon: 'lucide:key-round',
				description: 'Password and OAuth sign-in, built in.'
			},
			{
				label: 'File storage',
				href: `${resolve('/')}#files`,
				icon: 'lucide:image',
				description: 'Uploads stored in Cloudflare R2.'
			},
			{
				label: 'Self-hosting',
				href: `${resolve('/')}#self-hosting`,
				icon: 'lucide:cloud',
				description: 'Deploy to your own Cloudflare account.'
			}
		]
	},
	{
		label: 'Resources',
		links: [
			{
				label: 'Documentation',
				href: `${GITHUB_URL}#readme`,
				icon: 'lucide:book-open',
				description: 'Setup, configuration and the public API.'
			},
			{
				label: 'Releases',
				href: `${GITHUB_URL}/releases`,
				icon: 'lucide:tag',
				description: 'What changed in each version.'
			},
			{
				label: 'Issues',
				href: `${GITHUB_URL}/issues`,
				icon: 'lucide:circle-dot',
				description: 'Report a bug or request a feature.'
			}
		]
	},
	{ label: 'Docs', href: `${GITHUB_URL}#readme` }
];

export function isGroup(entry: NavGroup | NavLink): entry is NavGroup {
	return 'links' in entry;
}
