<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import type { DialogProps } from '#lib/components/ui/dialog/index.js';

	let { close }: DialogProps<boolean> = $props();
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title>Edit as HTML</Dialog.Title>
		<Dialog.Description>
			The email, with its layout and style, becomes an HTML document that you edit in a code editor.
			There is no way back to the visual editor, apart from discarding the change before saving.
		</Dialog.Description>
	</Dialog.Header>

	<Dialog.Footer>
		<Dialog.Close>Cancel</Dialog.Close>
		<Button.Root onclick={() => close(true)}>Edit as HTML</Button.Root>
	</Dialog.Footer>
</Dialog.Content>
