<script lang="ts">
	import Output from '#lib/components/output.svelte';
	import Panel from '#lib/components/panel.svelte';
	import { pb } from '#lib/pouchbase.svelte.js';
	import { Runner } from '#lib/run.svelte.js';

	const runner = new Runner();

	let id = $state('');
	let thumb = $state('');
	let download = $state(false);

	const url = $derived(
		id.trim() ? pb.files.url(id.trim(), { thumb: thumb || undefined, download }) : ''
	);
</script>

<Panel title="File URL" description="GET /api/files/<id> · pb.files.url()">
	<div class="stack">
		<div class="row">
			<label>File id <input bind:value={id} /></label>
			<label>Thumb <input bind:value={thumb} placeholder="100x100" /></label>
			<label class="check"><input type="checkbox" bind:checked={download} /> download</label>
		</div>
		{#if url}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a URL on the Pouchbase instance -->
			<a href={url} target="_blank" rel="noreferrer"><code>{url}</code></a>
			{#if !download}
				<img src={url} alt="Preview of the file" />
			{/if}
		{/if}
	</div>
</Panel>

<Panel title="Files collection" description="Records of the built-in files collection">
	<div class="row">
		<button
			disabled={runner.loading}
			onclick={() =>
				runner.run(() => pb.db.$collection('files').findMany({ orderBy: { created_at: 'desc' } }))}
		>
			List files
		</button>
	</div>
	<Output outcome={runner.outcome} />
</Panel>

<style>
	.check {
		display: flex;
		align-items: center;
	}

	img {
		max-width: 100%;
		max-height: 20rem;
		object-fit: contain;
		justify-self: start;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
	}
</style>
