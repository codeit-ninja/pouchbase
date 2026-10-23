<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { flip } from 'svelte/animate';
	import ToastItem from './toast-item.svelte';
	import { toasts } from './toast-state.svelte';

	let { class: className, ...rest }: HTMLAttributes<HTMLOListElement> = $props();
</script>

<!-- Render once, in the root layout; `toast.success(...)` and friends add toasts from anywhere. -->
<ol
	aria-label="Notifications"
	{...rest}
	class={[
		'pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end',
		className
	]}
>
	{#each toasts.items as item (item.id)}
		<li animate:flip={{ duration: 200 }} class="w-full sm:w-auto">
			<ToastItem {item} />
		</li>
	{/each}
</ol>
