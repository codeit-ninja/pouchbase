<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import * as Toast from '#lib/components/ui/toast/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<Toast.Root />
