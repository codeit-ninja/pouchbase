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
	<Dialog.Overlay
		class="fixed inset-0 z-50 bg-zinc-950/20 data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in motion-reduce:animate-none"
	/>

	<!--
		Docked to the right edge at full height, the counterpart of the sidebar on the left: same
		border, and a header with the height of the topbar so their bottom borders line up.
	-->
	<Dialog.Content
		bind:ref
		{...rest}
		class={[
			'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-xl outline-none data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in motion-reduce:animate-none',
			className
		]}
	>
		{@render children?.()}

		<!-- Rendered last so opening focuses the first field, not this button; centered in the header. -->
		<Dialog.Close>
			{#snippet child({ props })}
				<Button.Root
					{...props}
					variant="ghost"
					size="icon"
					aria-label="Close"
					class="absolute top-3 right-4"
				>
					<Icon.Root icon="lucide:x" />
				</Button.Root>
			{/snippet}
		</Dialog.Close>
	</Dialog.Content>
</Dialog.Portal>
