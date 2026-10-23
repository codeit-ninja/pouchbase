<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import AccountStep from './account-step.svelte';
</script>

<svelte:head>
	<title>Install · Pouchbase</title>
</svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold text-zinc-900">Install Pouchbase</h1>
		<p class="text-sm text-zinc-500">Create the first admin to finish your installation.</p>
	</header>

	<Card.Root>
		<AccountStep />
	</Card.Root>
</main>
