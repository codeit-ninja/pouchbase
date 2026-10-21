<script lang="ts">
	import { Dialog } from 'bits-ui';
	import * as Button from '../button';
	import * as Icon from '../icon';

	let {
		ref = $bindable(null),
		children,
		class: className,
		...rest
	}: Omit<Dialog.ContentProps, 'child'> = $props();
</script>

<Dialog.Portal>
	<Dialog.Overlay class="fixed inset-0 z-50 bg-zinc-950/30" />

	<Dialog.Content
		bind:ref
		{...rest}
		class={[
			'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-xl outline-none',
			className
		]}
	>
		{@render children?.()}

		<Dialog.Close>
			{#snippet child({ props })}
				<Button.Root
					{...props}
					variant="ghost"
					size="icon"
					aria-label="Close"
					class="absolute top-2 right-3"
				>
					<Icon.Root icon="lucide:x" />
				</Button.Root>
			{/snippet}
		</Dialog.Close>
	</Dialog.Content>
</Dialog.Portal>
