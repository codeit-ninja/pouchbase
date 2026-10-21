<script lang="ts">
	import type { HTMLLiAttributes } from 'svelte/elements';
	import { getStepsContext } from './steps-context';

	type Props = HTMLLiAttributes & {
		/** Position of this step (zero-based). */
		index: number;
	};

	let { index, children, class: className, ...rest }: Props = $props();

	const steps = getStepsContext();
	const status = $derived(
		index < steps.current ? 'complete' : index === steps.current ? 'current' : 'upcoming'
	);
</script>

<li
	{...rest}
	aria-current={status === 'current' ? 'step' : undefined}
	class={['flex flex-1 items-center gap-2 text-sm', className]}
>
	<span
		class={[
			'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
			status === 'complete' && 'border-zinc-900 bg-zinc-900 text-white',
			status === 'current' && 'border-zinc-900 text-zinc-900',
			status === 'upcoming' && 'border-zinc-300 text-zinc-400'
		]}
	>
		{status === 'complete' ? '✓' : index + 1}
	</span>
	<span class={status === 'upcoming' ? 'text-zinc-400' : 'font-medium text-zinc-900'}>
		{@render children?.()}
	</span>
</li>
