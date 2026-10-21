<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	let { children, class: className, ...rest }: HTMLAttributes<HTMLElement> = $props();
</script>

<main
	{...rest}
	class={['flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-8 py-8', className]}
>
	{@render children?.()}
</main>
