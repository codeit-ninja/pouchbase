<script lang="ts">
	import type { SectionResult } from '#lib/cloudflare/types.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';

	type Props = {
		/** A section result that has no data. */
		result: Extract<SectionResult<unknown>, { ok: false }>;
	};

	let { result }: Props = $props();
</script>

<!-- Why a section has no data: the token can't read it, or the app doesn't run on Cloudflare. -->
{#if result.reason === 'forbidden'}
	<Callout.Root variant="warning">
		<Callout.Icon><Icon.Root icon="lucide:key-round" /></Callout.Icon>
		<Callout.Body>
			<Callout.Title>The API token needs the "{result.permission}" permission</Callout.Title>
			<Callout.Description>{result.message}</Callout.Description>
		</Callout.Body>
	</Callout.Root>
{:else}
	<Callout.Root variant="info">
		<Callout.Icon><Icon.Root icon="lucide:info" /></Callout.Icon>
		<Callout.Body>
			<Callout.Description>{result.message}</Callout.Description>
		</Callout.Body>
	</Callout.Root>
{/if}
