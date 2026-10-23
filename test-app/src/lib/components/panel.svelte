<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, description, children }: { title: string; description?: string; children: Snippet } =
		$props();
</script>

<section class="panel">
	<header>
		<h2>{title}</h2>
		{#if description}
			<p>{description}</p>
		{/if}
	</header>
	{@render children()}
</section>

<style>
	.panel {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		background: var(--surface);
	}

	h2 {
		margin: 0;
		font-size: 1rem;
	}

	p {
		margin: 0.25rem 0 0;
		color: var(--muted);
		font-size: 0.875rem;
	}
</style>
