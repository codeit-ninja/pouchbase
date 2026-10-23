<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Code from '#lib/components/ui/inputs/code/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import * as Select from '#lib/components/ui/inputs/select/index.js';
	import * as Textarea from '#lib/components/ui/inputs/textarea/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { TEST_METHODS } from '#lib/functions/functions.js';
	import { testFunction } from '../functions.remote';
	import type { FunctionData, FunctionResponse } from '../types';

	type Props = { fn: FunctionData };

	let { fn }: Props = $props();

	const id = $props.id();

	const methods = TEST_METHODS.map((method) => ({ value: method, label: method }));

	let method = $state<(typeof TEST_METHODS)[number]>('GET');
	let path = $state('/');
	let headers = $state('');
	let body = $state('{\n\t\n}');

	let response = $state.raw<FunctionResponse | null>(null);
	let failure = $state<string | null>(null);

	const hasBody = $derived(method !== 'GET');

	/** The response body as formatted JSON, or `null` when it isn't JSON. */
	const json = $derived.by(() => {
		if (!response?.body) {
			return null;
		}

		try {
			return JSON.stringify(JSON.parse(response.body), null, '\t');
		} catch {
			return null;
		}
	});

	function statusVariant(status: number) {
		if (status >= 500) {
			return 'danger';
		}

		return status >= 400 ? 'warning' : 'success';
	}

	/** `Name: value` lines; lines without a colon are skipped. */
	function parseHeaders(text: string) {
		const result: Record<string, string> = {};

		for (const line of text.split('\n')) {
			const colon = line.indexOf(':');

			if (colon > 0) {
				result[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
			}
		}

		return result;
	}

	function errorMessage(error: unknown): string {
		const message = (error as { body?: { message?: unknown } } | null)?.body?.message;

		return typeof message === 'string' ? message : 'Something went wrong';
	}

	async function send() {
		failure = null;

		const sent = parseHeaders(headers);

		if (hasBody && !Object.keys(sent).some((name) => name.toLowerCase() === 'content-type')) {
			sent['Content-Type'] = 'application/json';
		}

		try {
			response = await testFunction({
				id: fn.id,
				method,
				path,
				headers: sent,
				body: hasBody ? body : null
			});
		} catch (error) {
			response = null;
			failure = errorMessage(error);
		}
	}
</script>

<div class="flex flex-col gap-4">
	<Card.Root>
		<Card.Header>
			<Card.Title>Request</Card.Title>
			<Card.Description>
				Sent to the deployed version without a signed-in user, also when the function requires
				sign-in: <code>pouchbaseUser(request)</code> returns <code>null</code>.
			</Card.Description>
		</Card.Header>

		<Card.Content class="flex flex-col gap-4">
			<div class="flex gap-2">
				<!-- The trigger fills its container, so the container sets the width. -->
				<div class="w-28 shrink-0">
					<Select.Root
						items={methods}
						bind:value={() => method, (next) => (method = next as typeof method)}
						aria-label="Method"
					/>
				</div>
				<Input.Root
					bind:value={path}
					aria-label="Path and query string"
					placeholder="/?name=Ada"
					class="min-w-0 flex-1 font-mono text-xs"
				/>
				<Button.Root disabled={!fn.deployed} onclick={send}>
					<Icon.Root icon="lucide:send" />
					Send
				</Button.Root>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="{id}-headers" class="text-sm font-medium text-zinc-900">Headers</label>
				<Textarea.Root
					id="{id}-headers"
					bind:value={headers}
					placeholder="Authorization: Bearer …"
					spellcheck={false}
					class="min-h-16 font-mono text-xs"
				/>
			</div>

			{#if hasBody}
				<div class="flex flex-col gap-1.5">
					<span id="{id}-body" class="text-sm font-medium text-zinc-900">Body</span>
					<Code.Root
						bind:value={body}
						language="json"
						lineNumbers={false}
						aria-labelledby="{id}-body"
						class="h-40"
					/>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if failure}
		<Callout.Root variant="error">
			<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
			<Callout.Body>
				<Callout.Description>{failure}</Callout.Description>
			</Callout.Body>
		</Callout.Root>
	{/if}

	{#if response}
		<Card.Root>
			<Card.Header>
				<div class="flex flex-wrap items-center gap-2">
					<Card.Title>Response</Card.Title>
					<Badge.Root variant={statusVariant(response.status)}>
						{response.status}
						{response.statusText}
					</Badge.Root>
					<span class="text-xs text-zinc-500 tabular-nums">{response.durationMs} ms</span>
				</div>
			</Card.Header>

			<Card.Content class="flex flex-col gap-4">
				<Collapsible.Root>
					<Collapsible.Trigger>Headers ({response.headers.length})</Collapsible.Trigger>
					<Collapsible.Content>
						<Table.Root>
							<Table.Body>
								{#each response.headers as [name, value], index (index)}
									<Table.Row>
										<Table.Cell class="w-0 font-mono text-xs whitespace-nowrap">{name}</Table.Cell>
										<Table.Cell class="font-mono text-xs break-all">{value}</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</Collapsible.Content>
				</Collapsible.Root>

				{#if response.truncated}
					<p class="text-xs text-zinc-500">Only the first 100,000 characters are shown.</p>
				{/if}

				{#key response}
					{#if json !== null}
						<Code.Root
							value={json}
							language="json"
							readonly
							aria-label="Response body"
							class="h-80"
						/>
					{:else}
						<Textarea.Root
							value={response.body}
							readonly
							aria-label="Response body"
							placeholder="(empty)"
							class="min-h-40 font-mono text-xs"
						/>
					{/if}
				{/key}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
