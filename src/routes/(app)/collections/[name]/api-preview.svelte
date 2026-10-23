<script lang="ts">
	import { page } from '$app/state';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as CodeBlock from '#lib/components/ui/code-block/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { API_RULE_LABELS, type ApiRuleAction, type ApiRules } from '#lib/filter/rules.js';
	import { apiExamples, type ApiParam } from './api-examples';
	import type { GridField } from './grid';

	type Props = {
		collection: { id: string; name: string; system: boolean };
		fields: GridField[];
		/** Name of the collection each relation field points to, keyed by field name. */
		relationTargets: Record<string, string>;
		rules: ApiRules | undefined;
		/** Shows the access rules, where the rules are edited. */
		onEditRules?: () => void;
	};

	let { collection, fields, relationTargets, rules, onEditRules }: Props = $props();

	const examples = $derived(apiExamples(collection, fields, relationTargets, page.url.origin));

	let selected = $state<ApiRuleAction>('list');
	let language = $state<'sdk' | 'curl'>('sdk');

	// A collection may not offer the selected action (`users` can't be created through the API).
	const example = $derived(
		examples.find((candidate) => candidate.action === selected) ?? examples[0]
	);
	const rule = $derived(rules?.[example.action] ?? null);
</script>

{#snippet params(title: string, list: ApiParam[])}
	<section class="flex flex-col gap-2" aria-label={title}>
		<h3 class="text-sm font-semibold text-zinc-900">{title}</h3>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Type</Table.Head>
					<Table.Head>Description</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each list as param (param.name)}
					<Table.Row>
						<Table.Cell class="align-top font-mono whitespace-nowrap">
							{param.name}
							{#if param.required}
								<Badge.Root variant="outline">required</Badge.Root>
							{/if}
						</Table.Cell>
						<Table.Cell class="align-top font-mono text-xs whitespace-nowrap"
							>{param.type}</Table.Cell
						>
						<Table.Cell class="align-top text-zinc-500">{param.description}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</section>
{/snippet}

<Sheet.Body>
	<Segmented.Root
		value={example.action}
		aria-label="Action"
		onValueChange={(next) => (selected = next as ApiRuleAction)}
		class="self-start"
	>
		{#each examples as candidate (candidate.action)}
			<Segmented.Item value={candidate.action}>{API_RULE_LABELS[candidate.action]}</Segmented.Item>
		{/each}
	</Segmented.Root>

	<p class="text-sm text-zinc-600">{example.description}</p>

	<div class="flex flex-wrap items-center gap-2 text-sm">
		<Badge.Root variant="neutral" class="font-mono">{example.method}</Badge.Root>
		<span class="font-mono break-all text-zinc-900">{example.path}</span>
	</div>

	<div class="flex flex-col gap-2 text-sm text-zinc-600">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-medium text-zinc-900">{API_RULE_LABELS[example.action]} rule:</span>
			{#if rule === null}
				<Badge.Root variant="warning">Locked: only admins</Badge.Root>
			{:else if !rule}
				<Badge.Root variant="success">Everyone</Badge.Root>
			{:else}
				<span class="font-mono text-zinc-900">{rule}</span>
			{/if}
			{#if onEditRules}
				<Button.Root variant="ghost" onclick={onEditRules}>
					<Icon.Root icon="lucide:shield" />
					Edit rules
				</Button.Root>
			{/if}
		</div>
		<p>
			Send <span class="font-mono">Authorization: Bearer &lt;token&gt;</span> to act as a signed-in
			user; the SDK does this after <span class="font-mono">pb.auth.signIn()</span>.
		</p>
	</div>

	<section class="flex flex-col gap-2" aria-label="Example">
		<Segmented.Root
			value={language}
			aria-label="Language"
			onValueChange={(next) => (language = next === 'curl' ? 'curl' : 'sdk')}
			class="self-start"
		>
			<Segmented.Item value="sdk">JavaScript SDK</Segmented.Item>
			<Segmented.Item value="curl">cURL</Segmented.Item>
		</Segmented.Root>

		<CodeBlock.Root code={language === 'sdk' ? example.sdk : example.curl} />
	</section>

	{#if example.queryParams.length}
		{@render params('Query parameters', example.queryParams)}
	{/if}

	{#if example.bodyParams.length}
		{@render params('Body (JSON)', example.bodyParams)}
	{/if}

	<section class="flex flex-col gap-3" aria-label="Responses">
		<h3 class="text-sm font-semibold text-zinc-900">Responses</h3>

		{#each example.responses as response (response.status)}
			<div class="flex flex-col gap-2">
				<div class="flex items-center gap-2 text-sm">
					<Badge.Root variant={response.status < 300 ? 'success' : 'danger'}>
						{response.status}
					</Badge.Root>
					<span class="text-zinc-600">{response.description}</span>
				</div>

				{#if response.body}
					<CodeBlock.Root code={response.body} copyable={false} />
				{/if}
			</div>
		{/each}
	</section>
</Sheet.Body>
