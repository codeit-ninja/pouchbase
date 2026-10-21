<script module lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	export type Props = Omit<HTMLInputAttributes, 'type'> & {
		ref?: HTMLInputElement | null;
	};
</script>

<script lang="ts">
	let { ref = $bindable(null), checked = $bindable(), class: className, ...rest }: Props = $props();
</script>

<input
	bind:this={ref}
	bind:checked
	type="checkbox"
	{...rest}
	class={[
		'size-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 disabled:cursor-not-allowed disabled:opacity-50',
		className
	]}
/>
