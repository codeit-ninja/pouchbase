<script module lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	export type Props = HTMLTextareaAttributes & {
		ref?: HTMLTextAreaElement | null;
	};
</script>

<script lang="ts">
	let { ref = $bindable(null), value = $bindable(), class: className, ...rest }: Props = $props();
</script>

<textarea
	bind:this={ref}
	bind:value
	{...rest}
	class={[
		'min-h-24 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs outline-none placeholder:text-zinc-400 focus-visible:border-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500 aria-invalid:ring-red-500/10',
		className
	]}></textarea>
