<script module lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	export type Props = HTMLAttributes<HTMLElement> & {
		/** The current page, from 1. */
		page: number;
		totalPages: number;
		/** The link to a page. */
		href: (page: number) => string;
	};
</script>

<script lang="ts">
	import * as Button from '../button';
	import * as Icon from '../icon';

	let { page, totalPages, href, class: className, ...rest }: Props = $props();
</script>

<!-- Previous and next links for a list split into pages; hidden when there is only one page. -->
{#if totalPages > 1}
	<nav
		aria-label="Pagination"
		{...rest}
		class={['flex items-center justify-between gap-4', className]}
	>
		{#if page > 1}
			<Button.Root variant="secondary" href={href(page - 1)} rel="prev">
				<Icon.Root icon="lucide:chevron-left" />
				Previous
			</Button.Root>
		{:else}
			<Button.Root variant="secondary" disabled>
				<Icon.Root icon="lucide:chevron-left" />
				Previous
			</Button.Root>
		{/if}

		<span class="text-sm text-zinc-600">Page {page} of {totalPages}</span>

		{#if page < totalPages}
			<Button.Root variant="secondary" href={href(page + 1)} rel="next">
				Next
				<Icon.Root icon="lucide:chevron-right" />
			</Button.Root>
		{:else}
			<Button.Root variant="secondary" disabled>
				Next
				<Icon.Root icon="lucide:chevron-right" />
			</Button.Root>
		{/if}
	</nav>
{/if}
