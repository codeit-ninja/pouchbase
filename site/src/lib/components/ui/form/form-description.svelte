<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { getFieldContext } from './form-context';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLParagraphElement> = $props();

	const { id } = getFieldContext();
</script>

<p id="{id}-description" {...rest} class={['text-sm text-zinc-500', className]}>
	{@render children?.()}
</p>
