<script lang="ts">
	import { fly } from 'svelte/transition';
	import * as Icon from '../icon';
	import { toasts, type ToastEntry, type Variant } from './toast-state.svelte';

	type Props = {
		item: ToastEntry;
	};

	let { item }: Props = $props();

	let paused = $state(false);

	const iconColors: Record<Variant, string> = {
		success: 'text-emerald-600',
		error: 'text-red-600',
		info: 'text-zinc-500'
	};

	// Closes the toast after its duration; hovering or focusing it pauses the countdown.
	$effect(() => {
		if (paused || !Number.isFinite(item.duration)) {
			return;
		}

		const timeout = setTimeout(() => toasts.dismiss(item.id), item.duration);

		return () => clearTimeout(timeout);
	});
</script>

<div
	role={item.variant === 'error' ? 'alert' : 'status'}
	aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
	aria-atomic="true"
	in:fly={{ y: 16, duration: 200 }}
	out:fly={{ x: 24, duration: 150 }}
	onmouseenter={() => (paused = true)}
	onmouseleave={() => (paused = false)}
	onfocusin={() => (paused = true)}
	onfocusout={() => (paused = false)}
	class="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-zinc-200 bg-white p-3 pr-2 text-sm shadow-lg sm:w-80"
>
	<span class={['mt-0.5 shrink-0 [&_svg]:size-4', iconColors[item.variant]]}>
		{#if item.variant === 'success'}
			<Icon.Root icon="lucide:circle-check" />
		{:else if item.variant === 'error'}
			<Icon.Root icon="lucide:circle-alert" />
		{:else}
			<Icon.Root icon="lucide:info" />
		{/if}
	</span>

	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<p class="font-medium text-zinc-900">{item.message}</p>

		{#if item.description}
			<p class="text-zinc-600">{item.description}</p>
		{/if}
	</div>

	<button
		type="button"
		aria-label="Dismiss"
		onclick={() => toasts.dismiss(item.id)}
		class="-my-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400 [&_svg]:size-3.5"
	>
		<Icon.Root icon="lucide:x" />
	</button>
</div>
