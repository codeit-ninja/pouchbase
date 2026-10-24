<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Link from '#lib/components/ui/link/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';
	import CreateTemplateDialog from './create-template-dialog.svelte';
	import MailSettings from './mail-settings.svelte';
	import { getMailSender, getMailTemplates } from './mail.remote';

	const [templates, sender] = $derived(await Promise.all([getMailTemplates(), getMailSender()]));

	const dialogs = Dialog.getDialogs();

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head>
	<title>Mail · Pouchbase</title>
</svelte:head>

<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>Mail</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
		<Page.Header>
			<div class="flex flex-col gap-1">
				<Page.Title>Mail</Page.Title>
				<Page.Description>
					Email templates with variables. Functions and your back-end send them with an API key
					through <code>POST /api/mail/send</code> or <code>pb.mail.send()</code> of the JS SDK.
				</Page.Description>
			</div>

			<Button.Root onclick={() => void dialogs.open(CreateTemplateDialog)}>
				<Icon.Root icon="lucide:plus" />
				New template
			</Button.Root>
		</Page.Header>

		{#if !sender.enabled}
			<Callout.Root variant="warning">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>
						Sending email isn't set up yet. Choose a provider and a sender address under
						<Link.Root href="#sending">Sending</Link.Root> to send templates.
					</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{/if}

		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Editor</Table.Head>
					<Table.Head>Updated</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each templates as template (template.name)}
					<Table.Row>
						<Table.Cell>
							<div class="flex min-w-0 flex-col">
								<span class="flex items-center gap-2">
									<Link.Root
										href={resolve('/(app)/mail/[name]', { name: template.name })}
										class="font-medium"
									>
										{template.name}
									</Link.Root>
									{#if template.system}
										<Badge.Root variant="outline">Built-in</Badge.Root>
									{/if}
									{#if template.customized}
										<Badge.Root variant="warning">Changed</Badge.Root>
									{/if}
								</span>
								{#if template.description}
									<span class="truncate text-xs text-zinc-500">{template.description}</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell>{template.editor === 'visual' ? 'Visual' : 'HTML'}</Table.Cell>
						<Table.Cell class="whitespace-nowrap">
							{template.updatedAt ? dateFormat.format(template.updatedAt) : 'Default'}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>

		<div id="sending" class="flex flex-col gap-4">
			<MailSettings />
		</div>
	</div>
</Page.Root>
