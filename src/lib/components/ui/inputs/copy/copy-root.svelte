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
	import * as CopyButton from '../../copy-button';
	import * as Input from '../input';

	let { value, id, class: className, label = 'Copy to clipboard' }: Props = $props();
</script>

<!-- Read-only value with a copy button, e.g. a callback URL to paste elsewhere. -->
<div class={['flex gap-2', className]}>
	<Input.Root {id} {value} readonly class="min-w-0 flex-1 font-mono text-xs text-zinc-600" />

	<CopyButton.Root {value} {label} />
</div>
