<script lang="ts">
	import Features from './features.svelte';
	import Hero from './hero.svelte';
	import SelfHosting from './self-hosting.svelte';
</script>

<svelte:head>
	<title>Pouchbase · The open-source backend for Cloudflare Workers</title>
	<meta
		name="description"
		content="Pouchbase is an open-source backend for Cloudflare Workers, D1 and R2, inspired by PocketBase. Collections, users, OAuth sign-in and file storage on your own Cloudflare account."
	/>
</svelte:head>

<Hero />
<Features />
<SelfHosting />
