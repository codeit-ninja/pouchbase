<script lang="ts">
	import { describeError, type Outcome } from '#lib/run.svelte.js';

	let { outcome }: { outcome: Outcome | null } = $props();

	const text = $derived(
		outcome === null
			? ''
			: (JSON.stringify(outcome.ok ? outcome.value : describeError(outcome.error), null, 2) ??
					'undefined')
	);
</script>

{#if outcome}
	<div class="output" class:error={!outcome.ok}>
		<div class="meta">
			<span>{outcome.ok ? 'OK' : 'Error'}</span>
			<span>{outcome.ms.toFixed(0)} ms</span>
		</div>
		<pre>{text}</pre>
	</div>
{/if}

<style>
	.output {
		border: 1px solid var(--border);
		border-left: 3px solid var(--ok);
		border-radius: 0.375rem;
		overflow: hidden;
	}

	.output.error {
		border-left-color: var(--danger);
	}

	.meta {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 0.75rem;
		background: var(--subtle);
		color: var(--muted);
		font-size: 0.75rem;
	}

	pre {
		margin: 0;
		padding: 0.75rem;
		max-height: 24rem;
		overflow: auto;
		font-size: 0.8125rem;
	}
</style>
