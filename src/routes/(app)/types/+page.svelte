<script lang="ts">
	import { page } from '$app/state';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as CopyButton from '#lib/components/ui/copy-button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Code from '#lib/components/ui/inputs/code/index.js';
	import * as Copy from '#lib/components/ui/inputs/copy/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import RegenerateTokenDialog from './regenerate-token-dialog.svelte';
	import { getTypes } from './types.remote';

	const types = $derived(await getTypes());

	const url = $derived.by(() => {
		const apiUrl = new URL('/api/types', page.url.origin);

		apiUrl.searchParams.set('token', types.token);

		return apiUrl.toString();
	});

	const command = $derived(`npx @pouchbasejs/js-sdk types "${url}" --out src/pouchbase.ts`);

	const dialogs = Dialog.getDialogs();
</script>

<svelte:head>
	<title>Types · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Types</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Types</Page.Title>
				<Page.Description>
					TypeScript types of your collections, for the JavaScript SDK:
					<span class="font-mono">createClient&lt;Schema&gt;(url)</span>.
				</Page.Description>
			</div>
		</Page.Header>

		<Card.Root>
			<Card.Header>
				<Card.Title>Generate with the SDK</Card.Title>
				<Card.Description>
					Run this in your project, for example in a script or CI job, to write the latest types to
					a file. Anyone with the URL can read the names and fields of your collections, not their
					records.
				</Card.Description>
			</Card.Header>

			<Card.Content class="flex flex-col gap-3">
				<Copy.Root value={command} label="Copy command" />

				<div class="flex flex-wrap items-center gap-2">
					<Copy.Root value={url} label="Copy URL" class="min-w-0 flex-1" />

					<Button.Root variant="secondary" onclick={() => void dialogs.open(RegenerateTokenDialog)}>
						<Icon.Root icon="lucide:refresh-cw" />
						New token
					</Button.Root>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<div class="flex items-start justify-between gap-4">
					<div class="flex flex-col gap-1">
						<Card.Title id="types-code-title">pouchbase.ts</Card.Title>
						<Card.Description>Or copy the types and paste them into your project.</Card.Description>
					</div>

					<CopyButton.Root value={types.code} size="default">Copy</CopyButton.Root>
				</div>
			</Card.Header>

			<Card.Content>
				<Code.Root
					value={types.code}
					language="typescript"
					readonly
					aria-labelledby="types-code-title"
					class="h-[32rem]"
				/>
			</Card.Content>
		</Card.Root>
	</div>
</Page.Root>
