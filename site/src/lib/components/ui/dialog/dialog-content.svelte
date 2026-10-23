<script lang="ts">
	import * as Icon from '../icon';
	import { Dialog } from 'bits-ui';
	import * as Button from '../button';

	let {
		ref = $bindable(null),
		children,
		class: className,
		...rest
	}: Omit<Dialog.ContentProps, 'child'> = $props();
</script>

<Dialog.Portal>
	<Dialog.Overlay class="fixed inset-0 z-50 bg-zinc-950/40" />

	<Dialog.Content
		bind:ref
		{...rest}
		class={[
			'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-lg outline-none',
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
					class="absolute top-3 right-3"
				>
					<Icon.Root icon="lucide:x" />
				</Button.Root>
			{/snippet}
		</Dialog.Close>
	</Dialog.Content>
</Dialog.Portal>
