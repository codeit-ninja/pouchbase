<script lang="ts">
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Page from '#lib/components/ui/page/index.js';
	import * as Skeleton from '#lib/components/ui/skeleton/index.js';
	import * as Topbar from '#lib/components/ui/topbar/index.js';

	type Props = {
		/** Breadcrumb of the page, which is known before its data is in. */
		title: string;
	};

	let { title }: Props = $props();
</script>

<!-- Placeholder for regular pages while their data loads: the real Topbar, placeholder content. -->
<Topbar.Root>
	<Breadcrumb.Root>
		<Breadcrumb.Item>
			<Breadcrumb.Page>{title}</Breadcrumb.Page>
		</Breadcrumb.Item>
	</Breadcrumb.Root>
</Topbar.Root>

<Page.Root aria-busy="true">
	<span class="sr-only" role="status">Loading…</span>

	<div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
		<Page.Header>
			<div class="flex flex-col gap-2">
				<Skeleton.Root class="h-7 w-56" />
				<Skeleton.Root class="h-4 w-80" />
			</div>
		</Page.Header>

		<Card.Root>
			<Card.Content class="flex flex-col gap-3">
				<Skeleton.Root class="h-4 w-24" />
				<Skeleton.Root class="h-control w-full" />
				<Skeleton.Root class="h-4 w-2/3" />
			</Card.Content>
		</Card.Root>
	</div>
</Page.Root>
