<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import { fileUrl } from '#lib/files/files.js';
	import ImageEditor from './image-editor.svelte';

	type Props = {
		file: { id: string; name: string; mimeType: string; version: string | number };
	} & DialogProps<boolean>;

	let { file, close }: Props = $props();

	/** Loads the original, at a URL that changes with the file so an old version isn't reused. */
	function load(src: string) {
		return new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new Image();

			image.onload = () => resolve(image);
			image.onerror = () => reject(new Error('The image could not be loaded.'));
			image.src = src;
		});
	}
</script>

<Dialog.Content size="xl">
	<Dialog.Header>
		<Dialog.Title>Edit image</Dialog.Title>
		<Dialog.Description>
			Changes are applied to <span class="font-mono">{file.name}</span>, which is replaced by the
			result. Its thumbnails are regenerated.
		</Dialog.Description>
	</Dialog.Header>

	{#await load(fileUrl(file.id, { version: file.version }))}
		<p class="py-16 text-center text-sm text-zinc-500">Loading image…</p>
	{:then image}
		<ImageEditor
			fileId={file.id}
			name={file.name}
			mimeType={file.mimeType}
			{image}
			onSaved={() => close(true)}
		/>
	{:catch failure}
		<div
			role="alert"
			class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
		>
			{failure.message}
		</div>

		<Dialog.Footer>
			<Dialog.Close>Close</Dialog.Close>
		</Dialog.Footer>
	{/await}
</Dialog.Content>
