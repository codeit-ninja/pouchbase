<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as Icon from '../icon/index.js';

	type Props = HTMLAttributes<HTMLElement> & {
		title: string;
		/** Iconify name shown before the title. */
		icon?: string;
		/** Buttons next to the title, e.g. move and delete. */
		actions?: Snippet;
	};

	let { title, icon, actions, children, class: className, ...rest }: Props = $props();
</script>

<section {...rest} class={['flex flex-col gap-4 p-4', className]}>
	<header class="flex min-h-7 items-center gap-2">
		{#if icon}
			<Icon.Root {icon} class="size-4 text-zinc-500" />
		{/if}
		<h3 class="text-sm font-semibold text-zinc-900">{title}</h3>
		{#if actions}
			<div class="ml-auto flex items-center gap-0.5">{@render actions()}</div>
		{/if}
	</header>

	{@render children?.()}
</section>
