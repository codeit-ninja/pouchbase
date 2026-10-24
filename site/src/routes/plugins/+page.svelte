<script lang="ts">
	import * as Button from '#lib/components/ui/button/index.js';
	import * as ChipGroup from '#lib/components/ui/chip-group/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import * as Pagination from '#lib/components/ui/pagination/index.js';
	import { categories } from '#lib/plugin-categories.js';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import PluginCard from './plugin-card.svelte';

	let { data }: PageProps = $props();

	/** The link to this page with the current search, a category and a page. */
	function link(options: { category?: string | null; page?: number }) {
		const params: Record<string, string> = {};

		if (data.query) {
			params.q = data.query;
		}

		if (options.category) {
			params.category = options.category;
		}

		if (options.page && options.page > 1) {
			params.page = String(options.page);
		}

		const search = new URLSearchParams(params).toString();

		return resolve('/plugins') + (search ? `?${search}` : '');
	}
</script>

<svelte:head>
	<title>Plugins · Pouchbase</title>
	<meta
		name="description"
		content="Plugins for Pouchbase: sign-in providers, field types, pages and integrations, installed from the Plugins page of your dashboard."
	/>
</svelte:head>

<div class="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 lg:py-16">
	<div class="flex max-w-2xl flex-col gap-3">
		<h1
			class="font-display text-3xl leading-tight font-semibold tracking-tight text-zinc-950 sm:text-4xl"
		>
			Plugins
		</h1>
		<p class="text-lg text-zinc-600">
			Add sign-in providers, field types and pages to Pouchbase. Install them from the Plugins page
			of your dashboard, or
			<a
				href={resolve('/docs/plugins')}
				class="font-medium text-brand-600 underline-offset-4 hover:underline">build your own</a
			>.
		</p>
	</div>

	<div class="flex flex-col gap-4">
		<form method="GET" action={resolve('/plugins')} role="search" class="flex gap-2">
			<label for="plugin-search" class="sr-only">Search plugins</label>
			<Input.Root
				id="plugin-search"
				type="search"
				name="q"
				value={data.query}
				placeholder="Search plugins"
				class="w-full max-w-md"
			/>
			{#if data.category}
				<input type="hidden" name="category" value={data.category} />
			{/if}
			<Button.Root type="submit" variant="secondary">
				<Icon.Root icon="lucide:search" />
				Search
			</Button.Root>
		</form>

		<ChipGroup.Root aria-label="Categories">
			<ChipGroup.Item href={link({})} active={!data.category}>All</ChipGroup.Item>
			{#each categories as category (category.id)}
				<ChipGroup.Item
					href={link({ category: category.id })}
					active={data.category === category.id}
				>
					{category.label}
				</ChipGroup.Item>
			{/each}
		</ChipGroup.Root>
	</div>

	{#if data.plugins.length}
		<div class="flex flex-col gap-4">
			<p class="text-sm text-zinc-500">
				{data.total}
				{data.total === 1 ? 'plugin' : 'plugins'}
			</p>

			<ul class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.plugins as plugin (plugin.id)}
					<li><PluginCard {plugin} /></li>
				{/each}
			</ul>
		</div>

		<Pagination.Root
			page={data.page}
			totalPages={data.totalPages}
			href={(page) => link({ category: data.category, page })}
		/>
	{:else}
		<Empty.Root>
			<Empty.Icon><Icon.Root icon="lucide:puzzle" /></Empty.Icon>
			<Empty.Title>No plugins found</Empty.Title>
			<Empty.Description>
				{#if data.query || data.category}
					Try another search or category.
				{:else}
					No plugins have been published yet.
				{/if}
			</Empty.Description>
		</Empty.Root>
	{/if}
</div>
