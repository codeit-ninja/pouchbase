<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import { PersistedState } from 'runed';

	const open = new PersistedState('stack-open', false);
</script>

<h1>Pouchbase</h1>

<Collapsible.Root bind:open={open.current}>
	<Collapsible.Trigger>Stack</Collapsible.Trigger>
	<Collapsible.Content>
		<ul>
			<li>SvelteKit 3 + Svelte 5</li>
			<li>bits-ui (headless componenten)</li>
			<li>runed (utilities voor runes)</li>
			<li>Cloudflare Workers (adapter-cloudflare)</li>
		</ul>
	</Collapsible.Content>
</Collapsible.Root>
