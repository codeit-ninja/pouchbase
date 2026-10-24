<script module lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	export type Props = Omit<HTMLButtonAttributes, 'type'> & {
		/** Picture of the option, e.g. an image with a filter applied. */
		src: string;
		/** CSS `filter` applied to the picture. */
		filter?: string;
		/** Whether this option is the chosen one. */
		selected?: boolean;
	};
</script>

<script lang="ts">
	let { src, filter, selected = false, children, class: className, ...rest }: Props = $props();
</script>

<!-- A pickable option shown as a picture with a label, e.g. a filter preset. -->
<button
	type="button"
	aria-pressed={selected}
	{...rest}
	class={[
		'flex flex-col gap-1 rounded-lg p-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-50',
		selected ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100',
		className
	]}
>
	<img {src} alt="" class="aspect-square w-full rounded-md object-cover" style:filter />
	{@render children?.()}
</button>
