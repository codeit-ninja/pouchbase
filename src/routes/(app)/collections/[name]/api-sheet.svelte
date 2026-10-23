<script lang="ts">
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Spinner from '#lib/components/ui/spinner/index.js';
	import type { ApiRules } from '#lib/filter/rules.js';
	import ApiPreview from './api-preview.svelte';
	import ApiRulesForm from './api-rules.svelte';
	import { getUserFields } from './collection-settings.remote';
	import type { GridField } from './grid';

	type Props = {
		collection: { id: string; name: string; system: boolean };
		fields: GridField[];
		/** Name of the collection each relation field points to, keyed by field name. */
		relationTargets: Record<string, string>;
		/** The saved API rules. */
		rules: ApiRules | undefined;
		open?: boolean;
	};

	let { collection, fields, relationTargets, rules, open = $bindable(false) }: Props = $props();

	let tab = $state<'rules' | 'preview'>('rules');
</script>

<!-- The records API of a collection: who may use it (the API rules) and how to call it. -->
<Sheet.Root bind:open>
	<Sheet.Content size="wide">
		<Sheet.Header>
			<Sheet.Title>API</Sheet.Title>
			<Sheet.Description>
				The records API of <span class="font-mono">{collection.name}</span>:
				<span class="font-mono">/api/collections/{collection.name}/records</span>
			</Sheet.Description>
		</Sheet.Header>

		<div class="border-b border-zinc-200 px-6 py-3">
			<Segmented.Root
				value={tab}
				aria-label="Section"
				onValueChange={(next) => (tab = next === 'preview' ? 'preview' : 'rules')}
			>
				<Segmented.Item value="rules">Access rules</Segmented.Item>
				<Segmented.Item value="preview">Preview</Segmented.Item>
			</Segmented.Root>
		</div>

		<!-- Both stay mounted, so unsaved rules survive a look at the preview. -->
		<div class={['flex min-h-0 flex-1 flex-col', tab !== 'rules' && 'hidden']}>
			<svelte:boundary>
				<ApiRulesForm
					{collection}
					{fields}
					{relationTargets}
					{rules}
					userFields={await getUserFields()}
				/>

				{#snippet pending()}
					<div class="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500">
						<Spinner.Root />
						Loading rules…
					</div>
				{/snippet}
			</svelte:boundary>
		</div>

		<div class={['flex min-h-0 flex-1 flex-col', tab !== 'preview' && 'hidden']}>
			<ApiPreview
				{collection}
				{fields}
				{relationTargets}
				{rules}
				onEditRules={() => (tab = 'rules')}
			/>
		</div>
	</Sheet.Content>
</Sheet.Root>
