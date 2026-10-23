<script module lang="ts">
	/** A choice in the access menu of a rule, and the rule it stands for (`null`: locked). */
	export type AccessOption = {
		value: string;
		label: string;
		description: string;
		icon: string;
		rule: string | null;
		/** Who it allows, as the end of a sentence: `users whose id is in author`. */
		who?: string;
	};

	/** The value of the access menu for a custom rule. */
	export const CUSTOM = 'custom';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Code from '#lib/components/ui/inputs/code/index.js';
	import * as Select from '#lib/components/ui/inputs/select/index.js';
	import { checkFilter } from '#lib/filter/filter.js';
	import type { ApiRuleAction } from '#lib/filter/rules.js';

	type Props = {
		action: ApiRuleAction;
		/** The rule; `null` when locked. Changes as the access or the custom rule changes. */
		rule: string | null;
		options: AccessOption[];
		/** Fields of the collection and of `users`, for autocomplete and checking custom rules. */
		names: Code.FilterNames;
		/** A message from the server about this rule, after saving. */
		issue?: string;
		/** Called with the new rule, and whether it can be saved (a custom rule must be valid). */
		onRuleChange: (rule: string | null, valid: boolean) => void;
	};

	let { action, rule, options, names, issue, onRuleChange }: Props = $props();

	const ACTIONS: Record<
		ApiRuleAction,
		{ title: string; request: string; icon: string; verb: string; destructive: boolean }
	> = {
		list: {
			title: 'List and search',
			request: 'GET /records',
			icon: 'lucide:list',
			verb: 'list and search records',
			destructive: false
		},
		view: {
			title: 'View',
			request: 'GET /records/:id',
			icon: 'lucide:eye',
			verb: 'view records',
			destructive: false
		},
		create: {
			title: 'Create',
			request: 'POST /records',
			icon: 'lucide:plus',
			verb: 'create records',
			destructive: true
		},
		update: {
			title: 'Update',
			request: 'PATCH /records/:id',
			icon: 'lucide:pencil',
			verb: 'update records',
			destructive: true
		},
		delete: {
			title: 'Delete',
			request: 'DELETE /records/:id',
			icon: 'lucide:trash-2',
			verb: 'delete records',
			destructive: true
		}
	};

	const CUSTOM_HINTS: Record<ApiRuleAction, string> = {
		list: 'Only records that match the rule are listed; others are left out.',
		view: 'Only records that match the rule can be viewed; others are not found.',
		create: 'A new record is only created when it matches the rule.',
		update: 'Only records that match the rule (before the change) can be updated.',
		delete: 'Only records that match the rule can be deleted.'
	};

	const meta = $derived(ACTIONS[action]);

	/** The option of a rule; any rule without its own option is custom. */
	function optionOf(value: string | null) {
		return options.find((option) => option.rule === value)?.value ?? CUSTOM;
	}

	let access = $state(untrack(() => optionOf(rule)));
	// Kept while another option is chosen, so switching back doesn't lose it.
	let custom = $state(untrack(() => (optionOf(rule) === CUSTOM ? (rule ?? '') : '')));

	const problem = $derived(access === CUSTOM ? validate(custom) : null);

	const summary = $derived.by(() => {
		const option = options.find((candidate) => candidate.value === access);

		if (access === CUSTOM) {
			return { text: CUSTOM_HINTS[action], tone: 'neutral' as const };
		}

		if (!option || option.rule === null) {
			return {
				text: 'Only admins, in the dashboard. The API answers 403.',
				tone: 'neutral' as const
			};
		}

		if (option.rule === '') {
			return {
				text: `Anyone can ${meta.verb}, also without signing in.`,
				tone: meta.destructive ? ('warning' as const) : ('neutral' as const)
			};
		}

		return {
			text: `Only ${option.who ?? 'signed-in users'} can ${meta.verb}.`,
			tone: 'neutral' as const
		};
	});

	function choose(next: string) {
		access = next;

		const option = options.find((candidate) => candidate.value === next);

		if (next === CUSTOM) {
			// Start from the rule that was chosen, so it can be adjusted.
			custom ||= rule ?? '';
			onRuleChange(custom, !validate(custom));
		} else if (option) {
			onRuleChange(option.rule, true);
		}
	}

	function validate(text: string) {
		if (!text.trim()) {
			return { message: 'The rule is empty', start: 0, end: 0 };
		}

		return checkFilter(text, {
			fields: names.fields.map((field) => field.name),
			authFields: names.authFields.length ? names.authFields.map((field) => field.name) : undefined
		});
	}
</script>

<Card.Root class="flex flex-col gap-3 p-4">
	<div class="flex flex-wrap items-center gap-3">
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"
		>
			<Icon.Root icon={meta.icon} class="size-4" />
		</span>

		<div class="flex min-w-0 flex-1 flex-col">
			<h4 id="rule-{action}" class="text-sm font-semibold text-zinc-900">{meta.title}</h4>
			<span class="font-mono text-xs text-zinc-500">{meta.request}</span>
		</div>

		<!-- Next to the title; on narrow screens below it. -->
		<div class="w-full shrink-0 sm:w-64">
			<Select.Root
				items={options.map(({ value, label, description, icon }) => ({
					value,
					label,
					description,
					icon
				}))}
				value={access}
				onValueChange={choose}
				aria-labelledby="rule-{action}"
			/>
		</div>
	</div>

	{#if access === CUSTOM}
		<Code.Root
			language="filter"
			value={custom}
			onValueChange={(next) => {
				custom = next;
				onRuleChange(next, !validate(next));
			}}
			filterNames={names}
			diagnostics={() => (problem && custom.trim() ? [problem] : [])}
			lineNumbers={false}
			placeholder="e.g. author = @request.auth.id"
			aria-label="{meta.title} rule"
			aria-invalid={!!problem || !!issue}
			class="h-[5.5rem]"
		/>
	{/if}

	{#if access === CUSTOM && !custom.trim() && !issue}
		<p class="flex items-start gap-1.5 text-sm text-zinc-500">
			<Icon.Root icon="lucide:info" class="mt-0.5 size-4 shrink-0" />
			Write a filter; the editor suggests fields as you type. To allow everyone, choose Everyone.
		</p>
	{:else if issue || problem}
		<p class="flex items-start gap-1.5 text-sm text-red-600" role="alert">
			<Icon.Root icon="lucide:circle-alert" class="mt-0.5 size-4 shrink-0" />
			{issue ?? problem?.message}
		</p>
	{:else}
		<p
			class={[
				'flex items-start gap-1.5 text-sm',
				summary.tone === 'warning' ? 'text-amber-700' : 'text-zinc-500'
			]}
		>
			<Icon.Root
				icon={summary.tone === 'warning' ? 'lucide:triangle-alert' : 'lucide:info'}
				class="mt-0.5 size-4 shrink-0"
			/>
			{summary.text}
		</p>
	{/if}
</Card.Root>
