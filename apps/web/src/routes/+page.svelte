<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import { resource } from 'runed';
	import { pb } from '#lib/pocketbase.js';

	const health = resource(
		() => pb.baseURL,
		async () => {
			try {
				return await pb.health.check();
			} catch {
				return null;
			}
		}
	);
</script>

<h1>Welcome to SvelteKit</h1>

<p>
	PocketBase ({pb.baseURL}):
	{#if health.loading}
		controleren…
	{:else if health.current}
		online
	{:else}
		offline, start hem met <code>pnpm pb:dev</code>
	{/if}
</p>

<Collapsible.Root>
	<Collapsible.Trigger>Stack</Collapsible.Trigger>
	<Collapsible.Content>
		<ul>
			<li>SvelteKit 3 + Svelte 5</li>
			<li>bits-ui (headless componenten)</li>
			<li>runed (utilities voor runes)</li>
			<li>PocketBase JS SDK</li>
		</ul>
	</Collapsible.Content>
</Collapsible.Root>
