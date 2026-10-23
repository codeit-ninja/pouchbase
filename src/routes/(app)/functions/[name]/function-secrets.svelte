<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { getFunctionSecrets } from '../functions.remote';
	import type { FunctionData } from '../types';
	import DeleteSecretDialog from './delete-secret-dialog.svelte';
	import SecretDialog from './secret-dialog.svelte';

	type Props = { fn: FunctionData };

	let { fn }: Props = $props();

	const secrets = $derived(fn.deployed ? await getFunctionSecrets(fn.id) : []);

	const dialogs = Dialog.getDialogs();
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-start justify-between gap-4">
			<div class="flex flex-col gap-1.5">
				<Card.Title>Secrets</Card.Title>
				<Card.Description>
					API keys and other values the code reads from <code>env</code>, such as
					<code>env.STRIPE_KEY</code>. They are stored encrypted on the Worker, and can't be read
					back here. <code>env.POUCHBASE_URL</code> is always set to the URL of this installation.
				</Card.Description>
			</div>

			<Button.Root
				variant="secondary"
				disabled={!fn.deployed}
				onclick={() => void dialogs.open(SecretDialog, { fn })}
			>
				<Icon.Root icon="lucide:plus" />
				Add secret
			</Button.Root>
		</div>
	</Card.Header>

	<Card.Content>
		{#if !fn.deployed}
			<Empty.Root class="py-8">
				<Empty.Description>Deploy the function before adding secrets.</Empty.Description>
			</Empty.Root>
		{:else if secrets.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each secrets as name (name)}
						<Table.Row>
							<Table.Cell class="font-mono text-xs text-zinc-900">{name}</Table.Cell>
							<Table.Cell class="w-0 text-right whitespace-nowrap">
								<Button.Root
									variant="ghost"
									size="icon"
									aria-label="Change {name}"
									onclick={() => void dialogs.open(SecretDialog, { fn, name })}
								>
									<Icon.Root icon="lucide:pencil" />
								</Button.Root>
								<Button.Root
									variant="ghost"
									size="icon"
									aria-label="Delete {name}"
									onclick={() => void dialogs.open(DeleteSecretDialog, { fn, name })}
								>
									<Icon.Root icon="lucide:trash-2" />
								</Button.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="py-8">
				<Empty.Description>No secrets yet.</Empty.Description>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
