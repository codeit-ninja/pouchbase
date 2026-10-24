<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p {...rest} class={['text-current/80', className]}>
	{@render children?.()}
</p>
