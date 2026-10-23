<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Meter from '#lib/components/ui/meter/index.js';
	import { formatPercent, formatQuotaValue } from '#lib/cloudflare/format.js';
	import { computeMeters, PLAN_LABELS, windowLabel } from '#lib/cloudflare/limits.js';
	import { getCloudflareLimits, getCloudflarePlan } from './cloudflare.remote';
	import CloudflarePlanForm from './cloudflare-plan-form.svelte';
	import CloudflareSectionNotice from './cloudflare-section-notice.svelte';

	const [plan, result] = $derived(await Promise.all([getCloudflarePlan(), getCloudflareLimits()]));

	const meters = $derived(result.ok ? computeMeters(plan, result.data) : []);
</script>

<Card.Root>
	<Card.Header class="flex-row flex-wrap items-center justify-between gap-3">
		<div class="flex flex-col gap-1">
			<Card.Title class="text-base">{PLAN_LABELS[plan]}</Card.Title>
			<Card.Description>
				Usage of the whole account against the plan's included quotas.
			</Card.Description>
		</div>
		<CloudflarePlanForm {plan} />
	</Card.Header>

	<Card.Content class="p-0 pt-4">
		{#if !result.ok}
			<div class="px-6 pb-6">
				<CloudflareSectionNotice {result} />
			</div>
		{:else}
			<ul class="divide-y divide-zinc-100">
				{#each meters as meter (meter.quota.id)}
					{@const used = formatQuotaValue(meter.quota, meter.used)}
					{@const limit = formatQuotaValue(meter.quota, meter.quota.limit)}
					<li class="flex flex-col gap-2 px-6 py-4">
						<div class="flex items-center justify-between gap-4 text-sm">
							<span class="flex items-center gap-2 font-medium text-zinc-900">
								{meter.quota.label}
								{#if meter.status === 'exceeded'}
									<Icon.Root
										icon="lucide:circle-x"
										label="Over the limit"
										class="size-4 text-red-600"
									/>
								{:else if meter.status === 'warning'}
									<Icon.Root
										icon="lucide:triangle-alert"
										label="Close to the limit"
										class="size-4 text-amber-600"
									/>
								{/if}
							</span>
							<span class="text-zinc-700 tabular-nums">
								{used} / {limit}
								<span class="text-zinc-500">({formatPercent(meter.ratio)})</span>
							</span>
						</div>

						<Meter.Root
							value={meter.used}
							max={meter.quota.limit}
							status={meter.status}
							aria-label={meter.quota.label}
							aria-valuetext="{used} of {limit}, {formatPercent(meter.ratio)}"
						/>

						<p class="text-xs text-zinc-500">{windowLabel(meter.quota.window)}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
