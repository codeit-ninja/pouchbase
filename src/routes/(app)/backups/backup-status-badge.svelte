<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Spinner from '#lib/components/ui/spinner/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';

	type Props = {
		status: 'running' | 'uploading' | 'completed' | 'failed';
		/** What a running job is doing. */
		step?: string | null;
		/** Why it failed, or why the last attempt of a running job failed. */
		error?: string | null;
	};

	let { status, step = null, error = null }: Props = $props();
</script>

{#snippet badge()}
	{#if status === 'running'}
		<Badge.Root class="bg-sky-50 text-sky-700">
			<Spinner.Root class="size-3.5" />
			{step ?? 'Running'}
		</Badge.Root>
	{:else if status === 'uploading'}
		<Badge.Root class="bg-sky-50 text-sky-700">
			<Icon.Root icon="lucide:upload" />
			Uploading
		</Badge.Root>
	{:else if status === 'completed'}
		<Badge.Root class="bg-emerald-50 text-emerald-700">
			<Icon.Root icon="lucide:circle-check" />
			Completed
		</Badge.Root>
	{:else}
		<Badge.Root class="bg-red-50 text-red-700">
			<Icon.Root icon="lucide:circle-x" />
			Failed
		</Badge.Root>
	{/if}
{/snippet}

{#if error}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
				>
					{@render badge()}
				</button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>
			{status === 'running' ? `Retrying after: ${error}` : error}
		</Tooltip.Content>
	</Tooltip.Root>
{:else}
	{@render badge()}
{/if}
