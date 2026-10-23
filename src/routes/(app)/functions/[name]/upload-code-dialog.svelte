<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as File from '#lib/components/ui/inputs/file/index.js';
	import { languageOf, MAX_CODE_SIZE } from '#lib/functions/functions.js';
	import type { FunctionLanguage } from '#lib/functions/functions.js';

	type Props = DialogProps<{ language: FunctionLanguage; source: string }>;

	let { close }: Props = $props();

	const id = $props.id();

	let files = $state<FileList | undefined>();
	let failure = $state<string | null>(null);

	const file = $derived(files?.[0] ?? null);

	async function load() {
		if (!file) {
			return;
		}

		const language = languageOf(file.name);

		if (!language) {
			failure = 'Choose a .js, .mjs, .ts or .mts file';

			return;
		}

		const source = await file.text();

		if (!source.trim()) {
			failure = 'The file is empty';

			return;
		}

		close({ language, source });
	}
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Upload code</Dialog.Title>
		<Dialog.Description>
			Opens a JavaScript or TypeScript file in the editor; deploy it from there. A function is one
			ES module with a default export that has a <code>fetch</code> handler. To use npm packages,
			bundle them into one file first, for example with <code>esbuild --bundle --format=esm</code>.
		</Dialog.Description>
	</Dialog.Header>

	<div class="flex flex-col gap-4">
		<File.Root
			{id}
			bind:files
			accept=".js,.mjs,.ts,.mts"
			maxSize={MAX_CODE_SIZE}
			aria-label="Code file"
			onchange={() => (failure = null)}
		/>

		{#if failure}
			<Callout.Root variant="error">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>{failure}</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{/if}
	</div>

	<Dialog.Footer>
		<Dialog.Close>Cancel</Dialog.Close>
		<Button.Root disabled={!file} onclick={load}>Open in editor</Button.Root>
	</Dialog.Footer>
</Dialog.Content>
