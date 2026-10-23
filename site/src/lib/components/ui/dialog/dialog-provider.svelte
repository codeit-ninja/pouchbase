<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialogs, setDialogs } from './dialog-context.svelte';
	import Root from './dialog-root.svelte';

	let { children }: { children?: Snippet } = $props();

	const dialogs = setDialogs(new Dialogs());
</script>

{@render children?.()}

<!-- The one dialog root of the app; dialogs are opened with `getDialogs().open(...)`. -->
<Root
	bind:open={
		() => dialogs.isOpen,
		(open) => {
			if (!open) {
				dialogs.dismiss();
			}
		}
	}
	onOpenChangeComplete={(open) => {
		if (!open) {
			dialogs.cleanup();
		}
	}}
>
	{#if dialogs.current}
		{@const { component: Dialog, props, close } = dialogs.current}

		{#key dialogs.current}
			<Dialog {...props} {close} />
		{/key}
	{/if}
</Root>
