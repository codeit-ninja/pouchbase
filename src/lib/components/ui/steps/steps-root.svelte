<script lang="ts">
	import type { HTMLOlAttributes } from 'svelte/elements';
	import { setStepsContext } from './steps-context';

	type Props = HTMLOlAttributes & {
		/** Index of the active step. */
		current: number;
	};

	let { current, children, class: className, ...rest }: Props = $props();

	setStepsContext({
		get current() {
			return current;
		}
	});
</script>

<ol {...rest} class={['flex items-center gap-2', className]}>
	{@render children?.()}
</ol>
