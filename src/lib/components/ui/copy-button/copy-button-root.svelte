<script module lang="ts">
	import type { Snippet } from 'svelte';
	import type { Size, Variant } from '../button/index.js';

	export type Props = {
		/** The text that is copied. */
		value: string;
		/** Accessible name of the button when it has no text. */
		label?: string;
		variant?: Variant;
		size?: Size;
		class?: string;
		/** Text next to the icon; without it the button shows only the icon. */
		children?: Snippet;
	};
</script>

<script lang="ts">
	import * as Button from '../button';
	import * as Icon from '../icon';
	import { toast } from '../toast';

	let {
		value,
		label = 'Copy to clipboard',
		variant = 'secondary',
		size = 'icon',
		children,
		class: className
	}: Props = $props();

	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			toast.error('Could not copy to the clipboard');

			return;
		}

		toast.success('Copied to clipboard');
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<!-- Copies `value`; icon-only by default, or with a text when it has children. -->
<Button.Root
	class={className}
	{variant}
	{size}
	aria-label={children ? undefined : label}
	onclick={() => void copy()}
>
	{#if copied}
		<Icon.Root icon="lucide:check" />
	{:else}
		<Icon.Root icon="lucide:copy" />
	{/if}
	{@render children?.()}
</Button.Root>
