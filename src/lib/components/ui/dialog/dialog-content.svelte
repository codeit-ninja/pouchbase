<script module lang="ts">
	import { Dialog } from 'bits-ui';

	export type Size = 'sm' | 'md' | 'lg' | 'xl';

	export type ContentProps = Omit<Dialog.ContentProps, 'child'> & {
		/** Maximum width; use this instead of a `max-w-*` class, which would conflict. */
		size?: Size;
	};
</script>

<script lang="ts">
	import * as Icon from '../icon';
	import * as Button from '../button';
	import * as ScrollArea from '../scroll-area/index.js';

	let {
		ref = $bindable(null),
		children,
		size = 'sm',
		class: className,
		...rest
	}: ContentProps = $props();

	const sizes: Record<Size, string> = {
		sm: 'max-w-md',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		xl: 'max-w-5xl'
	};
</script>

<Dialog.Portal>
	<Dialog.Overlay class="fixed inset-0 z-50 bg-zinc-950/40" />

	<Dialog.Content
		bind:ref
		{...rest}
		class={[
			'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg outline-none',
			sizes[size]
		]}
	>
		<!-- Only the body scrolls; the close button stays in the corner. -->
		<ScrollArea.Root class="min-h-0 flex-1">
			<div class={['flex flex-col gap-4 p-6', className]}>
				{@render children?.()}
			</div>
		</ScrollArea.Root>

		<Dialog.Close>
			{#snippet child({ props })}
				<Button.Root
					{...props}
					variant="ghost"
					size="icon"
					aria-label="Close"
					class="absolute top-3 right-3 bg-white"
				>
					<Icon.Root icon="lucide:x" />
				</Button.Root>
			{/snippet}
		</Dialog.Close>
	</Dialog.Content>
</Dialog.Portal>
