import { resolve } from '$app/paths';

export interface DocsLink {
	label: string;
	href: string;
}

export interface DocsGroup {
	label: string;
	links: DocsLink[];
}

/** The docs sidebar, in reading order. */
export const docsNavigation: DocsGroup[] = [
	{
		label: 'Getting started',
		links: [
			{ label: 'Overview', href: resolve('/docs/getting-started') },
			{ label: 'Cloudflare Workers', href: resolve('/docs/getting-started/cloudflare-workers') },
			{ label: 'Docker', href: resolve('/docs/getting-started/docker') },
			{ label: 'Single binary', href: resolve('/docs/getting-started/single-binary') }
		]
	},
	{
		label: 'Build your app',
		links: [
			{ label: 'Authentication', href: resolve('/docs/authentication') },
			{ label: 'Collections and records', href: resolve('/docs/collections') },
			{ label: 'Realtime', href: resolve('/docs/realtime') },
			{ label: 'Functions', href: resolve('/docs/functions') },
			{ label: 'Email templates', href: resolve('/docs/email') }
		]
	}
];
