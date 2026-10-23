<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import type { Severity } from '#lib/environments/diff.js';

	let { severity }: { severity: Severity } = $props();
</script>

<!-- Safe steps get no badge: only what can fail or lose data stands out. -->
{#if severity === 'destructive'}
	<Badge.Root variant="danger">Removes data</Badge.Root>
{:else if severity === 'risky'}
	<Badge.Root variant="warning">Can fail</Badge.Root>
{/if}
