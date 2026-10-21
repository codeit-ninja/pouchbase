<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { Dialog } from 'bits-ui';
	import * as Button from '../button';

	type Props = Omit<HTMLButtonAttributes, 'type'> & {
		variant?: Button.Variant;
	};

	let { variant = 'secondary', children, ...rest }: Props = $props();
</script>

<Dialog.Close>
	{#snippet child({ props })}
		<Button.Root {...props} {...rest} type="button" {variant}>
			{@render children?.()}
		</Button.Root>
	{/snippet}
</Dialog.Close>
