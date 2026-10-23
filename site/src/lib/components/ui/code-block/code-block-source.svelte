<script lang="ts">
	import type { HighlightedCode } from '#lib/highlight.js';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLSpanElement> & {
		/** Highlighted on the server with `#lib/server/highlight.ts`. */
		code: HighlightedCode;
	};

	let { code, class: className, ...rest }: Props = $props();
</script>

<!-- Source code (a file or a snippet) instead of terminal lines, with syntax highlighting. -->
<span {...rest} class={['block leading-6 whitespace-pre [tab-size:2] text-zinc-100', className]}>
	{#each code.lines as line, index (index)}
		<span class="block min-h-6">
			{#each line as token, position (position)}
				<span style:color={token.color}>{token.text}</span>
			{/each}
		</span>
	{/each}
</span>
