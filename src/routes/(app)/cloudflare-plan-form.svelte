<script lang="ts">
	import type { CloudflarePlan } from '#lib/cloudflare/limits.js';
	import * as Form from '#lib/components/ui/form/index.js';
	import { CLOUDFLARE_PLANS, PLAN_LABELS } from '#lib/cloudflare/limits.js';
	import { cloudflarePlanSchema } from '#lib/schemas/cloudflare.js';
	import { updateCloudflarePlan } from './cloudflare.remote';

	type Props = {
		plan: CloudflarePlan;
	};

	let { plan }: Props = $props();

	const planForm = updateCloudflarePlan.preflight(cloudflarePlanSchema);

	const items = CLOUDFLARE_PLANS.map((value) => ({ value, label: PLAN_LABELS[value] }));
</script>

<!-- The plan can't be read from the API, so the admin picks it; the limits follow right away. -->
<Form.Root form={planForm} success="Plan saved" class="flex-row items-center gap-2">
	<Form.Field field={planForm.fields.plan} orientation="horizontal">
		<Form.Label class="sr-only">Plan</Form.Label>
		<Form.Select defaultValue={plan} {items} class="w-40" />
		<Form.Errors />
	</Form.Field>

	<Form.Submit variant="secondary">Save</Form.Submit>
</Form.Root>
