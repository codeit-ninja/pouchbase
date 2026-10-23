<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type ItemProps = {
		value: string;
		/** Required for icon-only items. */
		'aria-label'?: string;
		disabled?: boolean;
		class?: string;
		children?: Snippet;
	};
</script>

<script lang="ts">
	import { ToggleGroup } from 'bits-ui';

	let { value, class: className, children, ...rest }: ItemProps = $props();
</script>

<!-- Until the root's indicator is placed (e.g. before hydration), the active item draws its own background. -->
<ToggleGroup.Item
	{value}
	{...rest}
	data-segmented-value={value}
	class={[
		'relative z-10 inline-flex min-w-7 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-white data-[state=on]:text-zinc-900 data-[state=on]:shadow-sm group-data-ready/segmented:data-[state=on]:bg-transparent group-data-ready/segmented:data-[state=on]:shadow-none',
		className
	]}
>
	{@render children?.()}
</ToggleGroup.Item>
