<script lang="ts">
	import { untrack } from 'svelte';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import type * as Code from '#lib/components/ui/inputs/code/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { USERS_COLLECTION } from '#lib/auth/users.js';
	import {
		apiActions,
		ownerRule,
		SIGNED_IN_RULE,
		type ApiRuleAction,
		type ApiRules
	} from '#lib/filter/rules.js';
	import { apiRulesSchema } from '#lib/schemas/collection-settings.js';
	import ApiRuleCard, { CUSTOM, type AccessOption } from './api-rule-card.svelte';
	import { updateApiRules } from './collection-settings.remote';
	import type { GridField } from './grid';

	type Props = {
		collection: { id: string; name: string; system: boolean };
		fields: GridField[];
		/** Name of the collection each relation field points to, keyed by field name. */
		relationTargets: Record<string, string>;
		/** The saved rules. */
		rules: ApiRules | undefined;
		/** Fields of `users`, for `@request.auth.*`. */
		userFields: Code.FilterName[];
	};

	let { collection, fields, relationTargets, rules, userFields }: Props = $props();

	const form = $derived(updateApiRules.for(`rules-${collection.id}`).preflight(apiRulesSchema));
	const actions = $derived(apiActions(collection));
	const isUsers = $derived(collection.system && collection.name === USERS_COLLECTION);

	const names = $derived<Code.FilterNames>({
		fields: fields
			.filter((field) => field.type !== 'blob')
			.map((field) => ({ name: field.name, type: field.type })),
		authFields: userFields
	});

	// "Owner" choices: relation fields that point to `users`, or the user itself in `users`.
	const owners = $derived(
		isUsers
			? [{ field: 'id', multiple: false }]
			: fields
					.filter(
						(field) => field.type === 'relation' && relationTargets[field.name] === USERS_COLLECTION
					)
					.map((field) => ({ field: field.name, multiple: !!field.options.multiple }))
	);

	const options = $derived<AccessOption[]>([
		{
			value: 'locked',
			label: 'Admins only',
			description: 'Not available through the API',
			icon: 'lucide:lock',
			rule: null
		},
		{
			value: 'everyone',
			label: 'Everyone',
			description: 'Also without signing in',
			icon: 'lucide:globe',
			rule: ''
		},
		{
			value: 'signed-in',
			label: 'Signed-in users',
			description: 'Any user with a valid token',
			icon: 'lucide:user-check',
			rule: SIGNED_IN_RULE,
			who: 'signed-in users'
		},
		...owners.map(({ field, multiple }) =>
			isUsers
				? {
						value: 'owner:id',
						label: 'The user themselves',
						description: 'Each user only their own record',
						icon: 'lucide:user-round',
						rule: ownerRule('id'),
						who: 'the user themselves'
					}
				: {
						value: `owner:${field}`,
						label: `Owner (${field})`,
						description: multiple ? `Users listed in ${field}` : `The user in ${field}`,
						icon: 'lucide:user-round',
						rule: ownerRule(field, multiple),
						who: multiple ? `users listed in ${field}` : `the user in ${field}`
					}
		),
		{
			value: CUSTOM,
			label: 'Custom rule',
			description: 'Write a filter',
			icon: 'lucide:code-xml',
			rule: null
		}
	]);

	function initial(): Record<ApiRuleAction, string | null> {
		return {
			list: rules?.list ?? null,
			view: rules?.view ?? null,
			create: rules?.create ?? null,
			update: rules?.update ?? null,
			delete: rules?.delete ?? null
		};
	}

	let current = $state(untrack(initial));
	let saved = $state(untrack(initial));
	let invalid = $state<Partial<Record<ApiRuleAction, boolean>>>({});
	// Bumped to remount the cards, e.g. after discarding changes.
	let generation = $state(0);

	const dirty = $derived(actions.some((action) => current[action] !== saved[action]));
	const hasProblems = $derived(actions.some((action) => invalid[action]));

	function discard() {
		current = { ...saved };
		invalid = {};
		generation++;
	}

	const EXAMPLES = [
		['Only the author', 'author = @request.auth.id'],
		['Signed-in users', '@request.auth.id != ""'],
		['Verified users', '@request.auth.verified = true'],
		['Published, or your own', 'status = "published" || author = @request.auth.id'],
		['Only as yourself (create)', '@request.body.author = @request.auth.id'],
		['Any of a multiple relation', 'editors ?= @request.auth.id']
	];
</script>

<Form.Root
	{form}
	success="API rules saved"
	class="min-h-0 flex-1 gap-0"
	enhance={async (instance) => {
		if (await instance.submit()) {
			saved = { ...current };
		}
	}}
>
	<Form.Hidden field={form.fields.collection} value={collection.name} />

	{#each actions as action (action)}
		<Form.Hidden field={form.fields[action]} value={current[action] ?? ''} />
		<Form.Hidden field={form.fields[`${action}Locked`]} value={current[action] === null} />
	{/each}

	<Sheet.Body>
		<p class="text-sm text-zinc-600">
			Choose who can use each action of the records API. New collections are private: only admins
			can reach their records until you open them up here.
		</p>

		{#key generation}
			<div class="flex flex-col gap-3">
				{#each actions as action (action)}
					<ApiRuleCard
						{action}
						rule={current[action]}
						{options}
						{names}
						issue={form.fields[action].issues()?.[0]?.message}
						onRuleChange={(rule, valid) => {
							current[action] = rule;
							invalid[action] = !valid;
						}}
					/>
				{/each}
			</div>
		{/key}

		{#if isUsers}
			<p class="text-sm text-zinc-500">
				Users can't be created through the records API: they sign up through
				<span class="font-mono">/api/auth/password/sign-up</span> or OAuth. Their
				<span class="font-mono">email</span> and <span class="font-mono">verified</span> can't be changed
				through it either.
			</p>
		{:else if !actions.includes('create')}
			<p class="text-sm text-zinc-500">
				Files are added by uploading them, so they can only be listed, viewed and deleted through
				the records API.
			</p>
		{/if}

		<Collapsible.Root>
			<Collapsible.Trigger>How custom rules work</Collapsible.Trigger>
			<Collapsible.Content class="flex flex-col gap-4 pt-3 text-sm text-zinc-600">
				<p>
					A custom rule is a filter: a request is only allowed for records that match it. Combine
					conditions with <code class="font-mono">&&</code> and
					<code class="font-mono">||</code>, and group them with parentheses. The editor suggests
					fields as you type.
				</p>

				<Table.Root>
					<Table.Body>
						<Table.Row>
							<Table.Cell class="font-mono whitespace-nowrap">title, author, …</Table.Cell>
							<Table.Cell>Fields of the record</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-mono whitespace-nowrap">@request.auth.id</Table.Cell>
							<Table.Cell>
								A field of the signed-in user, from <span class="font-mono">users</span>; empty when
								signed out
							</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-mono whitespace-nowrap">@request.body.title</Table.Cell>
							<Table.Cell>A submitted value, in create and update rules</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-mono whitespace-nowrap">@now</Table.Cell>
							<Table.Cell>The current date and time</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-mono whitespace-nowrap">= != &gt; &gt;= &lt; &lt;=</Table.Cell
							>
							<Table.Cell
								>Compare; <span class="font-mono">= ""</span> also matches empty values</Table.Cell
							>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-mono whitespace-nowrap">~ !~</Table.Cell>
							<Table.Cell>Contains, doesn't contain (case-insensitive)</Table.Cell>
						</Table.Row>
						<Table.Row>
							<Table.Cell class="font-mono whitespace-nowrap">?= ?~ …</Table.Cell>
							<Table.Cell>Any item of a multiple relation or list matches</Table.Cell>
						</Table.Row>
					</Table.Body>
				</Table.Root>

				<div class="flex flex-col gap-2">
					<h4 class="font-medium text-zinc-900">Examples</h4>
					<Table.Root>
						<Table.Body>
							{#each EXAMPLES as [label, example] (example)}
								<Table.Row>
									<Table.Cell>{label}</Table.Cell>
									<Table.Cell class="font-mono">{example}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			</Collapsible.Content>
		</Collapsible.Root>
	</Sheet.Body>

	<Sheet.Footer>
		{#if dirty}
			<p class="mr-auto text-sm text-zinc-500">Unsaved changes</p>
			<Button.Root variant="ghost" onclick={discard}>Discard</Button.Root>
		{/if}

		<Form.Submit disabled={!dirty || hasProblems}>Save rules</Form.Submit>
	</Sheet.Footer>
</Form.Root>
