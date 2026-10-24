<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import type { Snippet } from 'svelte';
	import { resendVerification } from './account.remote';

	type Props = {
		/** The address the verification email goes to. */
		email: string;
		title: string;
		children: Snippet;
	};

	let { email, title, children }: Props = $props();
</script>

<!-- Asks to follow the link in the verification email, with a button to send it again. -->
<Callout.Root variant="success">
	<Callout.Icon><Icon.Root icon="lucide:mail-check" /></Callout.Icon>
	<Callout.Body class="flex flex-col gap-3">
		<Callout.Title>{title}</Callout.Title>
		<Callout.Description>{@render children()}</Callout.Description>

		<Form.Root form={resendVerification} success="Verification email sent">
			<Form.Hidden field={resendVerification.fields.email} value={email} />
			<Form.Submit variant="secondary">Send the email again</Form.Submit>
		</Form.Root>
	</Callout.Body>
</Callout.Root>
