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
		label: 'Introduction',
		links: [{ label: 'Getting started', href: resolve('/docs/getting-started') }]
	}
];
