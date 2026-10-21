<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { DropdownMenu } from 'bits-ui';
	import * as Button from '../button';

	type Props = Omit<HTMLButtonAttributes, 'type'> & {
		variant?: Button.Variant;
		size?: Button.Size;
	};

	let { variant = 'secondary', size = 'default', children, ...rest }: Props = $props();
</script>

<DropdownMenu.Trigger>
	{#snippet child({ props })}
		<Button.Root {...props} {...rest} type="button" {variant} {size}>
			{@render children?.()}
		</Button.Root>
	{/snippet}
</DropdownMenu.Trigger>
