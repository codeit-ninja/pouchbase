<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Code from '#lib/components/ui/code/index.js';
	import * as CopyButton from '#lib/components/ui/copy-button/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { publishTokenSchema } from '#lib/schemas/account.js';
	import { createToken, deleteToken, getPublishTokens } from './account.remote';

	const tokens = $derived(await getPublishTokens());

	const form = createToken.preflight(publishTokenSchema);

	/** The new token, shown once after it was created. */
	let created = $state<string | null>(null);

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Publish tokens</Card.Title>
		<Card.Description>
			For <Code.Root>pouchbase-plugin publish</Code.Root>, for example in CI: set the token as
			<Code.Root>POUCHBASE_REGISTRY_TOKEN</Code.Root>. A token publishes as you.
		</Card.Description>
	</Card.Header>

	<Card.Content class="flex flex-col gap-4">
		{#if created}
			<Callout.Root variant="warning">
				<Callout.Icon><Icon.Root icon="lucide:triangle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>
						Copy the token now: it isn't shown again. Keep it secret, like a password.
					</Callout.Description>
				</Callout.Body>
			</Callout.Root>

			<div class="flex gap-2">
				<Input.Root
					value={created}
					readonly
					aria-label="Publish token"
					class="min-w-0 flex-1 font-mono"
				/>
				<CopyButton.Root value={created} label="Copy token" />
			</div>
		{/if}

		<Form.Root
			{form}
			class="sm:flex-row sm:items-start"
			enhance={async (instance) => {
				if (await instance.submit()) {
					created = instance.result?.token ?? null;
					instance.element.reset();
				}
			}}
		>
			<Form.Field field={form.fields.name} class="flex-1">
				<Form.Label class="sr-only">Name</Form.Label>
				<Form.Input placeholder="Name, e.g. GitHub Actions" autocomplete="off" />
				<Form.Errors />
			</Form.Field>

			<div>
				<Form.Submit variant="secondary">
					<Icon.Root icon="lucide:plus" />
					New token
				</Form.Submit>
			</div>
		</Form.Root>

		{#if tokens.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Token</Table.Head>
						<Table.Head>Last used</Table.Head>
						<Table.Head><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each tokens as token (token.id)}
						{@const remove = deleteToken.for(token.id)}
						<Table.Row>
							<Table.Cell class="font-medium text-zinc-900">{token.name}</Table.Cell>
							<Table.Cell class="font-mono text-xs whitespace-nowrap">{token.prefix}…</Table.Cell>
							<Table.Cell class="whitespace-nowrap">
								{token.lastUsedAt ? dateFormat.format(new Date(token.lastUsedAt)) : 'Never'}
							</Table.Cell>
							<Table.Cell class="w-0 text-right">
								<Form.Root form={remove}>
									<Form.Hidden field={remove.fields.id} value={token.id} />
									<Form.Submit variant="ghost" size="icon" aria-label="Delete {token.name}">
										<Icon.Root icon="lucide:trash-2" />
									</Form.Submit>
								</Form.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</Card.Content>
</Card.Root>
