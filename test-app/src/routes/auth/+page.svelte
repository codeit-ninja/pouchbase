<script lang="ts">
	import type { OAuthProviderInfo } from '@pouchbasejs/js-sdk';
	import Output from '#lib/components/output.svelte';
	import Panel from '#lib/components/panel.svelte';
	import { auth, pb } from '#lib/pouchbase.svelte.js';
	import { Runner } from '#lib/run.svelte.js';

	const runner = new Runner();

	let providers = $state<OAuthProviderInfo[]>([]);
	let signUp = $state({ name: '', email: '', password: '' });
	let signIn = $state({ email: '', password: '' });
	let email = $state('');
	let token = $state('');
	let newPassword = $state('');

	pb.auth.providers().then(
		(list) => (providers = list),
		() => (providers = [])
	);
</script>

<Panel title="Auth store" description="pb.authStore, kept in localStorage by LocalAuthStore">
	<div class="row">
		<button disabled={runner.loading} onclick={() => runner.run(() => pb.auth.me())}>
			pb.auth.me()
		</button>
		<button class="ghost" onclick={() => runner.run(async () => pb.authStore.isValid)}>
			authStore.isValid
		</button>
		<button class="ghost" disabled={!auth.state} onclick={() => pb.auth.signOut()}>
			pb.auth.signOut()
		</button>
	</div>
	<pre>{JSON.stringify(auth.state, null, 2)}</pre>
</Panel>

<Output outcome={runner.outcome} />

<div class="grid">
	<Panel title="Sign up" description="POST /api/auth/password/sign-up">
		<form
			class="stack"
			onsubmit={(event) => {
				event.preventDefault();
				runner.run(() =>
					pb.auth.signUp({
						name: signUp.name,
						email: signUp.email,
						password: signUp.password
					})
				);
			}}
		>
			<label>Name <input bind:value={signUp.name} autocomplete="name" /></label>
			<label>Email <input bind:value={signUp.email} type="email" autocomplete="email" /></label>
			<label>
				Password <input bind:value={signUp.password} type="password" autocomplete="new-password" />
			</label>
			<button disabled={runner.loading}>Sign up</button>
		</form>
	</Panel>

	<Panel title="Sign in" description="POST /api/auth/password/sign-in">
		<form
			class="stack"
			onsubmit={(event) => {
				event.preventDefault();
				runner.run(() => pb.auth.signIn(signIn.email, signIn.password));
			}}
		>
			<label>Email <input bind:value={signIn.email} type="email" autocomplete="email" /></label>
			<label>
				Password
				<input bind:value={signIn.password} type="password" autocomplete="current-password" />
			</label>
			<button disabled={runner.loading}>Sign in</button>
		</form>
	</Panel>

	<Panel title="OAuth" description="pb.auth.signInWithOAuth() opens a popup">
		<div class="row">
			{#each providers as provider (provider.provider)}
				<button
					disabled={runner.loading}
					onclick={() => runner.run(() => pb.auth.signInWithOAuth(provider.provider))}
				>
					{provider.label}
				</button>
			{:else}
				<p class="muted">No providers are enabled on this instance.</p>
			{/each}
		</div>
	</Panel>

	<Panel title="Email" description="Password resets and verification">
		<div class="stack">
			<label>Email <input bind:value={email} type="email" /></label>
			<div class="row">
				<button
					disabled={runner.loading}
					onclick={() => runner.run(() => pb.auth.requestPasswordReset(email))}
				>
					Request reset
				</button>
				<button
					disabled={runner.loading}
					onclick={() => runner.run(() => pb.auth.requestVerification(email))}
				>
					Request verification
				</button>
			</div>
			<label>Token from the email <input bind:value={token} /></label>
			<label>New password <input bind:value={newPassword} type="password" /></label>
			<div class="row">
				<button
					disabled={runner.loading}
					onclick={() => runner.run(() => pb.auth.confirmPasswordReset(token, newPassword))}
				>
					Confirm reset
				</button>
				<button
					disabled={runner.loading}
					onclick={() => runner.run(() => pb.auth.confirmVerification(token))}
				>
					Confirm verification
				</button>
			</div>
		</div>
	</Panel>
</div>

<style>
	pre {
		margin: 0;
		font-size: 0.8125rem;
		overflow: auto;
	}
</style>
