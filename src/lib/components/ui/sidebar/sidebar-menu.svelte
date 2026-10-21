<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLUListElement> = $props();
</script>

<ul {...rest} class={['flex flex-col gap-0.5', className]}>
	{@render children?.()}
</ul>
