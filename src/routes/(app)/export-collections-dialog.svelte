<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Checkbox from '#lib/components/ui/inputs/checkbox/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { listCollections } from './collections.remote';

	let { close }: DialogProps = $props();

	const id = $props.id();

	const collections = $derived(await listCollections());

	// Collections that are left out; everything is exported by default.
	const excluded = new SvelteSet<string>();

	const selected = $derived(collections.filter((collection) => !excluded.has(collection.name)));
	const href = $derived(
		selected.length === collections.length
			? resolve('/(app)/collections/export')
			: `${resolve('/(app)/collections/export')}?collections=${encodeURIComponent(selected.map((collection) => collection.name).join(','))}`
	);
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Export collections</Dialog.Title>
		<Dialog.Description>
			Downloads a JSON file with the fields, indexes, API rules and settings of the collections, but
			not their records. Import it on this or another instance.
		</Dialog.Description>
	</Dialog.Header>

	<fieldset class="flex flex-col gap-2">
		<legend class="sr-only">Collections to export</legend>

		{#each collections as collection (collection.id)}
			<label for="{id}-{collection.id}" class="flex items-center gap-2 text-sm text-zinc-700">
				<Checkbox.Root
					id="{id}-{collection.id}"
					checked={!excluded.has(collection.name)}
					onchange={(event) =>
						event.currentTarget.checked
							? excluded.delete(collection.name)
							: excluded.add(collection.name)}
				/>
				{collection.name}
			</label>
		{/each}
	</fieldset>

	<Dialog.Footer>
		<Dialog.Close>Cancel</Dialog.Close>
		{#if selected.length}
			<Button.Root {href} download onclick={() => close()}>
				<Icon.Root icon="lucide:download" />
				Download
			</Button.Root>
		{:else}
			<Button.Root disabled>
				<Icon.Root icon="lucide:download" />
				Download
			</Button.Root>
		{/if}
	</Dialog.Footer>
</Dialog.Content>
