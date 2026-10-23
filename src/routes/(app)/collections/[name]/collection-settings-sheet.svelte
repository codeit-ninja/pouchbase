<script lang="ts">
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { FILES_COLLECTION } from '#lib/files/files.js';
	import { thumbnailSettingsSchema } from '#lib/schemas/collection-settings.js';
	import { getCollectionSettings, updateThumbnailSettings } from './collection-settings.remote';

	type Props = {
		collection: { id: string; name: string; system: boolean };
		open?: boolean;
	};

	let { collection, open = $bindable(false) }: Props = $props();

	const isFiles = $derived(collection.system && collection.name === FILES_COLLECTION);

	// Only loaded while the panel is open.
	const settings = $derived(open ? await getCollectionSettings(collection.name) : null);

	const thumbnailsForm = $derived(
		updateThumbnailSettings.for(collection.id).preflight(thumbnailSettingsSchema)
	);
</script>

<!-- Settings per collection; each section only shows for the collections it applies to. -->
<Sheet.Root bind:open>
	<Sheet.Content>
		<Sheet.Header>
			<Sheet.Title>Settings</Sheet.Title>
			<Sheet.Description>
				Settings of <span class="font-mono">{collection.name}</span>
			</Sheet.Description>
		</Sheet.Header>

		<Sheet.Body>
			{#if isFiles && settings}
				<section class="flex flex-col gap-4" aria-labelledby="thumbnail-settings">
					<div class="flex flex-col gap-1">
						<h3 id="thumbnail-settings" class="text-sm font-semibold text-zinc-900">Thumbnails</h3>
						<p class="text-sm text-zinc-500">
							Smaller versions of uploaded images (PNG, JPEG, GIF and WebP), made on upload and on
							first request.
						</p>
						<p class="text-sm text-zinc-500">
							URL: <span class="font-mono">/api/files/&lt;id&gt;?thumb=&lt;size&gt;</span>
						</p>
					</div>

					<Form.Root form={thumbnailsForm} success="Thumbnail settings saved">
						<Form.Hidden field={thumbnailsForm.fields.collection} value={collection.name} />

						<Form.Field field={thumbnailsForm.fields.enabled} orientation="horizontal">
							<Form.Checkbox defaultChecked={settings.thumbnails?.enabled ?? false} />
							<Form.Label>Generate thumbnails</Form.Label>
						</Form.Field>

						<Form.Field field={thumbnailsForm.fields.sizes}>
							<Form.Label>Sizes</Form.Label>
							<Form.Textarea
								class="min-h-20 font-mono"
								defaultValue={(settings.thumbnails?.sizes ?? []).join(', ')}
								placeholder="100x100, 300x0, 1200x0"
							/>
							<Form.Description>
								<span class="font-mono">WxH</span> crops to fill (also
								<span class="font-mono">WxHt</span> / <span class="font-mono">WxHb</span> from the
								top / bottom), <span class="font-mono">WxHf</span> fits inside without cropping,
								<span class="font-mono">Wx0</span> and <span class="font-mono">0xH</span> scale to a width
								or height. Images are never enlarged.
							</Form.Description>
							<Form.Errors />
						</Form.Field>

						<div class="flex justify-end">
							<Form.Submit>Save</Form.Submit>
						</div>
					</Form.Root>
				</section>
			{:else if !isFiles}
				<Empty.Root>
					<Empty.Icon><Icon.Root icon="lucide:sliders-horizontal" /></Empty.Icon>
					<Empty.Title>No settings yet</Empty.Title>
					<Empty.Description>This collection has no settings of its own yet.</Empty.Description>
				</Empty.Root>
			{/if}
		</Sheet.Body>

		<Sheet.Footer>
			<Sheet.Close>Close</Sheet.Close>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
