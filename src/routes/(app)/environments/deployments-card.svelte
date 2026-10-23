<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { getDeployments } from './environments.remote';

	const deployments = $derived(await getDeployments());

	const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>History</Card.Title>
		<Card.Description>Publishes to this instance and pulls into it, newest first.</Card.Description>
	</Card.Header>

	<Card.Content>
		{#if deployments.length}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Started</Table.Head>
						<Table.Head>From</Table.Head>
						<Table.Head>Changes</Table.Head>
						<Table.Head>Status</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each deployments as deployment (deployment.id)}
						<Table.Row>
							<Table.Cell class="whitespace-nowrap text-zinc-900">
								{dateFormat.format(deployment.startedAt)}
							</Table.Cell>
							<Table.Cell class="font-mono text-sm">{deployment.source}</Table.Cell>
							<Table.Cell class="tabular-nums">
								{deployment.done} of {deployment.total}
							</Table.Cell>
							<Table.Cell>
								{#if deployment.status === 'completed'}
									<Badge.Root variant="success">Completed</Badge.Root>
								{:else if deployment.status === 'failed'}
									<Badge.Root variant="danger" title={deployment.error ?? undefined}>
										Failed
									</Badge.Root>
								{:else}
									<Badge.Root variant="warning">Running</Badge.Root>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<Empty.Root class="py-8">
				<Empty.Title>Nothing published yet</Empty.Title>
				<Empty.Description>Publishes from a linked instance show up here.</Empty.Description>
			</Empty.Root>
		{/if}
	</Card.Content>
</Card.Root>
