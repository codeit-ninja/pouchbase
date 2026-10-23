<script module lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	export type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** The code, shown as is. */
		code: string;
		/** Shown above the code, e.g. a file name or `200`. */
		title?: string;
		/** Whether to show a button that copies the code. */
		copyable?: boolean;
	};
</script>

<script lang="ts">
	import * as CopyButton from '../copy-button/index.js';

	let { code, title, copyable = true, class: className, ...rest }: Props = $props();
</script>

<!--
	Read-only code without an editor, light enough for many blocks on one page (examples, example
	responses). Use `inputs/code` for code that is edited.
-->
<div
	{...rest}
	class={['relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50', className]}
>
	{#if title}
		<div class="border-b border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-500">{title}</div>
	{/if}

	<pre class="overflow-x-auto p-4 pr-14 font-mono text-[13px] leading-relaxed text-zinc-800"><code
			>{code}</code
		></pre>

	{#if copyable}
		<CopyButton.Root
			value={code}
			label="Copy code"
			variant="ghost"
			class="absolute right-2 {title ? 'top-10' : 'top-2'}"
		/>
	{/if}
</div>
