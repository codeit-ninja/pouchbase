<script lang="ts">
	import { page } from '$app/state';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Combobox from '#lib/components/ui/inputs/combobox/index.js';
	import type { PickedImage } from '#lib/components/ui/inputs/email-editor/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import { formatFileSize, MAX_FILE_SIZE } from '#lib/files/files.js';
	import { MAIL_IMAGE_TYPES } from '#lib/schemas/mail-templates.js';
	import { listMailImages, uploadMailImage } from '../mail.remote';

	type Props = DialogProps<PickedImage> & {
		/** The image being edited; empty when adding one. */
		current?: PickedImage;
	};

	let { current = { src: '', alt: '' }, close }: Props = $props();

	type MailImage = { id: string; name: string; path: string };

	/** The id of a file in `files`, when `url` points to one. */
	function fileIdOf(url: string) {
		return /\/api\/files\/([^/?#]+)/.exec(url)?.[1] ?? '';
	}

	// The dialog starts from the image it was opened with.
	// svelte-ignore state_referenced_locally
	let fileId = $state(fileIdOf(current.src));
	// svelte-ignore state_referenced_locally
	let tab = $state(current.src && !fileId ? 'url' : 'files');
	// svelte-ignore state_referenced_locally
	let src = $state(current.src);
	// svelte-ignore state_referenced_locally
	let alt = $state(current.alt);

	let search = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	const images = $derived(listMailImages({ search }));

	const items = $derived(
		(images.current ?? []).map((image) => ({
			value: image.id,
			label: image.name,
			description: formatFileSize(image.size),
			image: image.preview,
			icon: 'lucide:image'
		}))
	);

	/** Searches once typing pauses, instead of on every key. */
	function searchFor(text: string) {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => (search = text.trim()), 250);
	}

	/** The alternative text an image starts with: its file name without the extension. */
	function altFromName(name: string) {
		return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
	}

	/** Emails are read elsewhere, so they get the file's absolute URL. */
	function select(image: MailImage) {
		fileId = image.id;
		src = new URL(image.path, page.url.origin).href;
		alt ||= altFromName(image.name);
	}

	function selectById(id: string) {
		const image = images.current?.find((candidate) => candidate.id === id);

		if (image) {
			select(image);
		}
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();

		if (src.trim()) {
			close({ src: src.trim(), alt: alt.trim() });
		}
	}
</script>

<Dialog.Content size="md">
	<Dialog.Header>
		<Dialog.Title>{current.src ? 'Change image' : 'Add image'}</Dialog.Title>
		<Dialog.Description>
			Choose an image from files, upload one, or use a URL or variable such as
			<code>{'{{imageUrl}}'}</code>.
		</Dialog.Description>
	</Dialog.Header>

	<Segmented.Root value={tab} onValueChange={(next) => (tab = next)} aria-label="Image source">
		<Segmented.Item value="files">
			<Icon.Root icon="lucide:images" />
			Files
		</Segmented.Item>
		<Segmented.Item value="url">
			<Icon.Root icon="lucide:link" />
			URL
		</Segmented.Item>
	</Segmented.Root>

	{#if tab === 'files'}
		<Field.Root>
			<Field.Label for="email-image-file">Image</Field.Label>
			<Combobox.Root
				id="email-image-file"
				{items}
				value={fileId}
				placeholder="Search images in files…"
				emptyText={search ? 'No matching images' : 'No images in files yet'}
				loading={images.loading}
				aria-invalid={!!images.error}
				aria-describedby={images.error ? 'email-image-file-error' : undefined}
				onSearchChange={searchFor}
				onValueChange={selectById}
			/>
			{#if images.error}
				<Field.Description id="email-image-file-error" class="text-red-600">
					The images could not be loaded.
				</Field.Description>
			{/if}
		</Field.Root>

		<Form.Root
			form={uploadMailImage}
			enctype="multipart/form-data"
			enhance={async (instance) => {
				if (await instance.submit()) {
					const uploaded = instance.result;

					if (uploaded) {
						select(uploaded);
						search = '';
						await listMailImages({ search: '' }).refresh();
					}

					instance.element.reset();
				}
			}}
		>
			<Form.Field field={uploadMailImage.fields._image}>
				<Form.Label>Or upload a new image</Form.Label>
				<Form.File
					accept={MAIL_IMAGE_TYPES.join(',')}
					maxSize={MAX_FILE_SIZE}
					hint="PNG, JPEG, GIF or WebP up to {formatFileSize(MAX_FILE_SIZE)}"
				/>
				<Form.Description>The image is added to files.</Form.Description>
				<Form.Errors />
			</Form.Field>
			<div class="flex justify-end">
				<Form.Submit variant="secondary">
					<Icon.Root icon="lucide:upload" />
					Upload
				</Form.Submit>
			</div>
		</Form.Root>
	{/if}

	<!-- Not sent anywhere: the values go back to the editor. -->
	<form class="flex flex-col gap-4" onsubmit={submit}>
		{#if tab === 'url'}
			<Field.Root>
				<Field.Label for="email-image-url">Image URL</Field.Label>
				<Input.Root
					id="email-image-url"
					bind:value={src}
					placeholder="https://"
					autocomplete="off"
					required
					oninput={() => (fileId = fileIdOf(src))}
				/>
			</Field.Root>
		{/if}

		<Field.Root>
			<Field.Label for="email-image-alt">Alternative text</Field.Label>
			<Input.Root id="email-image-alt" bind:value={alt} autocomplete="off" />
			<Field.Description
				>Shown when images are blocked, and read by screen readers.</Field.Description
			>
		</Field.Root>

		<Dialog.Footer>
			<Dialog.Close>Cancel</Dialog.Close>
			<Button.Root type="submit" disabled={!src.trim()}>
				{current.src ? 'Save' : 'Add'}
			</Button.Root>
		</Dialog.Footer>
	</form>
</Dialog.Content>
