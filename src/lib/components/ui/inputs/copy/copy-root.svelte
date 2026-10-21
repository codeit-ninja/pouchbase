<script module lang="ts">
	export type Props = {
		value: string;
		id?: string;
		class?: string;
		/** Accessible label of the copy button. */
		label?: string;
	};
</script>

<script lang="ts">
	import * as Button from '../../button';
	import * as Icon from '../../icon';
	import * as Input from '../input';

	let { value, id, class: className, label = 'Copy to clipboard' }: Props = $props();

	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(value);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<!-- Read-only value with a copy button, e.g. a callback URL to paste elsewhere. -->
<div class={['flex gap-2', className]}>
	<Input.Root {id} {value} readonly class="min-w-0 flex-1 font-mono text-xs text-zinc-600" />

	<Button.Root type="button" variant="secondary" size="icon" aria-label={label} onclick={copy}>
		{#if copied}
			<Icon.Root icon="lucide:check" />
		{:else}
			<Icon.Root icon="lucide:copy" />
		{/if}
	</Button.Root>
</div>
