<script module lang="ts">
	export type LinkKind = 'link' | 'button' | 'image';

	export type LinkResult = { url: string; label: string } | { remove: true };
</script>

<script lang="ts">
	import * as Button from '../../button/index.js';
	import * as Dialog from '../../dialog/index.js';
	import * as Field from '../../field/index.js';
	import type { DialogProps } from '../../dialog/index.js';
	import * as Input from '../input/index.js';

	type Props = DialogProps<LinkResult> & {
		kind: LinkKind;
		/** The current URL, when editing. */
		url?: string;
		/** The label of a button, or the alternative text of an image. */
		label?: string;
	};

	let { kind, url = '', label = '', close }: Props = $props();

	const TEXT = {
		link: { title: 'Link', url: 'URL', label: '' },
		button: { title: 'Button', url: 'Links to', label: 'Label' },
		image: { title: 'Image', url: 'Image URL', label: 'Alternative text' }
	};

	const editing = $derived(!!url);

	// The form starts from the values it was opened with.
	// svelte-ignore state_referenced_locally
	let href = $state(url);
	// svelte-ignore state_referenced_locally
	let text = $state(label);

	function submit(event: SubmitEvent) {
		event.preventDefault();

		if (href.trim()) {
			close({ url: href.trim(), label: text.trim() });
		}
	}
</script>

<Dialog.Content>
	<Dialog.Header>
		<Dialog.Title
			>{editing
				? `Edit ${TEXT[kind].title.toLowerCase()}`
				: `Add ${TEXT[kind].title.toLowerCase()}`}</Dialog.Title
		>
		<Dialog.Description>
			A full URL, such as <code>https://example.com</code>, or a variable, such as
			<code>{'{{url}}'}</code>.
		</Dialog.Description>
	</Dialog.Header>

	<!-- Not sent anywhere: the values go back to the editor. -->
	<form class="flex flex-col gap-4" onsubmit={submit}>
		<Field.Root>
			<Field.Label for="email-link-url">{TEXT[kind].url}</Field.Label>
			<Input.Root
				id="email-link-url"
				bind:value={href}
				placeholder="https://"
				autocomplete="off"
				required
			/>
		</Field.Root>

		{#if kind !== 'link'}
			<Field.Root>
				<Field.Label for="email-link-label">{TEXT[kind].label}</Field.Label>
				<Input.Root
					id="email-link-label"
					bind:value={text}
					placeholder={kind === 'button' ? 'Get started' : ''}
					autocomplete="off"
				/>
			</Field.Root>
		{/if}

		<Dialog.Footer>
			{#if editing && kind === 'link'}
				<Button.Root
					type="button"
					variant="ghost"
					class="mr-auto"
					onclick={() => close({ remove: true })}
				>
					Remove link
				</Button.Root>
			{/if}
			<Dialog.Close>Cancel</Dialog.Close>
			<Button.Root type="submit" disabled={!href.trim()}>{editing ? 'Save' : 'Add'}</Button.Root>
		</Dialog.Footer>
	</form>
</Dialog.Content>
