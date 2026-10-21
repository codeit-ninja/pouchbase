<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Steps from '#lib/components/ui/steps/index.js';
	import AccountStep from './account-step.svelte';
	import SettingsStep from './settings-step.svelte';
	import { installState } from './install.remote';

	const steps = [
		{ id: 'account', label: 'Account' },
		{ id: 'settings', label: 'App settings' }
	] as const;

	const step = $derived(await installState());
	const current = $derived(steps.findIndex((s) => s.id === step));
</script>

<svelte:head>
	<title>Install · Pouchbase</title>
</svelte:head>

<main class="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold text-zinc-900">Install Pouchbase</h1>
		<p class="text-sm text-zinc-500">Complete the steps below to finish your installation.</p>
	</header>

	<Steps.Root {current}>
		{#each steps as s, index (s.id)}
			<Steps.Item {index}>{s.label}</Steps.Item>
		{/each}
	</Steps.Root>

	<Card.Root>
		{#if step === 'account'}
			<AccountStep />
		{:else if step === 'settings'}
			<SettingsStep />
		{/if}
	</Card.Root>
</main>
