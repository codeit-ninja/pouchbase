<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { auth, baseUrl, pb, resetInstance, switchInstance } from '#lib/pouchbase.svelte.js';
	import './layout.css';

	let { children } = $props();

	let url = $state(baseUrl);

	const links = [
		{ href: resolve('/'), label: 'Health' },
		{ href: resolve('/auth'), label: 'Auth' },
		{ href: resolve('/records'), label: 'Records' },
		{ href: resolve('/realtime'), label: 'Realtime' },
		{ href: resolve('/functions'), label: 'Functions' },
		{ href: resolve('/files'), label: 'Files' }
	];
</script>

<svelte:head>
	<title>Pouchbase test</title>
</svelte:head>

<div class="shell">
	<header class="top">
		<strong>Pouchbase test</strong>
		<form
			class="instance"
			onsubmit={(event) => {
				event.preventDefault();
				switchInstance(url);
			}}
		>
			<input bind:value={url} aria-label="Pouchbase URL" />
			<button type="submit" disabled={url.trim() === baseUrl}>Connect</button>
			<button type="button" class="ghost" onclick={resetInstance}>Reset</button>
		</form>
		<span class="user">
			{#if auth.state}
				Signed in as <code>{auth.state.userId}</code>
				<button type="button" class="ghost" onclick={() => pb.auth.signOut()}>Sign out</button>
			{:else}
				Signed out
			{/if}
		</span>
	</header>

	<nav>
		{#each links as link (link.href)}
			<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>
				{link.label}
			</a>
		{/each}
	</nav>

	<main>
		{@render children()}
	</main>
</div>

<style>
	.shell {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
	}

	.instance {
		display: flex;
		flex: 1;
		gap: 0.5rem;
		min-width: 18rem;
	}

	.instance input {
		flex: 1;
	}

	.user {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--muted);
		font-size: 0.875rem;
	}

	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 1rem 0;
		border-bottom: 1px solid var(--border);
	}

	nav a {
		padding: 0.5rem 0.75rem;
		color: var(--muted);
		text-decoration: none;
		border-bottom: 2px solid transparent;
	}

	nav a[aria-current='page'] {
		color: var(--text);
		border-bottom-color: var(--accent);
	}

	main {
		display: grid;
		gap: 1rem;
	}
</style>
