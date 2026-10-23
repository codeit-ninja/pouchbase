<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import { currentUser } from '../../../(auth)/auth.remote';
	import { getMailSender, getMailTemplate } from '../mail.remote';
	import TemplateEditor from './template-editor.svelte';

	const name = $derived(page.params.name ?? '');
	const [template, sender, user] = $derived(
		await Promise.all([getMailTemplate(name), getMailSender(), currentUser()])
	);
</script>

<svelte:head>
	<title>{template.name} · Mail · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Link href={resolve('/(app)/mail')}>Mail</Breadcrumb.Link>
		</Breadcrumb.Item>
		<Breadcrumb.Separator />
		<Breadcrumb.Item>
			<Breadcrumb.Page>{template.name}</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-7xl flex-col gap-6">
		<Page.Header>
			<div class="flex min-w-0 flex-col gap-1">
				<div class="flex flex-wrap items-center gap-2">
					<Page.Title>{template.name}</Page.Title>
					<Badge.Root variant="outline">
						{template.content.editor === 'visual' ? 'Visual' : 'HTML'}
					</Badge.Root>
					{#if template.system}
						<Badge.Root variant="outline">Built-in</Badge.Root>
					{/if}
				</div>
				{#if template.description}
					<Page.Description>{template.description}</Page.Description>
				{/if}
			</div>
		</Page.Header>

		<!-- A save or reset starts the editor again from the stored template. -->
		{#key template.updatedAt?.getTime() ?? 0}
			<TemplateEditor {template} from={sender.from} adminEmail={user?.email ?? ''} />
		{/key}
	</div>
</Page.Root>
