<script lang="ts">
	import Output from '#lib/components/output.svelte';
	import Panel from '#lib/components/panel.svelte';
	import { pb } from '#lib/pouchbase.svelte.js';
	import { Runner } from '#lib/run.svelte.js';

	const health = new Runner();
	const providers = new Runner();

	health.run(() => pb.health());
	providers.run(() => pb.auth.providers());
</script>

<div class="grid">
	<Panel title="Health" description="GET /api/health · pb.health()">
		<div class="row">
			<button disabled={health.loading} onclick={() => health.run(() => pb.health())}>Check</button>
		</div>
		<Output outcome={health.outcome} />
	</Panel>

	<Panel title="OAuth providers" description="GET /api/auth/providers · pb.auth.providers()">
		<div class="row">
			<button disabled={providers.loading} onclick={() => providers.run(() => pb.auth.providers())}>
				Load
			</button>
		</div>
		<Output outcome={providers.outcome} />
	</Panel>
</div>
