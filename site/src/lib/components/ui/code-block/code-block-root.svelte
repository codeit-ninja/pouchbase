<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import * as ScrollArea from '../scroll-area/index.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		/** Shown in the window bar, e.g. the file name or `Terminal`. */
		title?: string;
	};

	let { title, children, class: className, ...rest }: Props = $props();
</script>

<div
	{...rest}
	class={[
		'not-prose overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-100 shadow-2xl shadow-zinc-950/30',
		className
	]}
>
	{#if title}
		<div class="flex h-10 items-center gap-3 border-b border-zinc-800 px-4 text-xs text-zinc-400">
			<span class="flex gap-1.5" aria-hidden="true">
				<span class="size-2.5 rounded-full bg-zinc-700"></span>
				<span class="size-2.5 rounded-full bg-zinc-700"></span>
				<span class="size-2.5 rounded-full bg-zinc-700"></span>
			</span>
			{title}
		</div>
	{/if}

	<!-- Not a `<pre>`: each `Line` is its own block, so formatting whitespace never shows up. -->
	<ScrollArea.Root
		orientation="horizontal"
		variant="dark"
		viewportClass="p-5 font-mono leading-7 whitespace-nowrap"
	>
		<code class="block w-max min-w-full">{@render children?.()}</code>
	</ScrollArea.Root>
</div>
