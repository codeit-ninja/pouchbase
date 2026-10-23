<script module lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	/** `command` gets a prompt, `output` is plain, `comment` is muted. */
	export type Kind = 'command' | 'output' | 'comment';

	export type Props = HTMLAttributes<HTMLSpanElement> & {
		kind?: Kind;
	};
</script>

<script lang="ts">
	let { kind = 'command', children, class: className, ...rest }: Props = $props();

	const kinds = {
		command: 'text-zinc-100',
		output: 'text-zinc-400',
		comment: 'text-zinc-500'
	};
</script>

<span {...rest} class={['block', kinds[kind], className]}>
	{#if kind === 'command'}
		<span class="text-brand-400 select-none" aria-hidden="true">$ </span>
	{/if}

	{@render children?.()}
</span>
