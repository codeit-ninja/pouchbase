<script lang="ts">
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { resolve } from '$app/paths';
</script>

<Callout.Root variant="info">
	<Callout.Icon><Icon.Root icon="lucide:key-round" /></Callout.Icon>
	<Callout.Body>
		<Callout.Title>Have your Cloudflare credentials ready</Callout.Title>
		<Callout.Description>
			You need your Cloudflare account ID and an API token with the right permissions. See
			<a
				href="{resolve('/docs/getting-started')}#before-you-start"
				class="font-medium underline underline-offset-2">Before you start</a
			>.
		</Callout.Description>
	</Callout.Body>
</Callout.Root>
