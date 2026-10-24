<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as ProviderIcon from '#lib/components/ui/provider-icon/index.js';
	import { signInMethodIcon, type SignInMethod } from '#lib/auth/sign-in-methods.js';

	type Props = {
		methods: SignInMethod[];
	};

	let { methods }: Props = $props();
</script>

<!-- How a user can sign in: one badge per linked OAuth account, plus one for a password. -->
{#if methods.length}
	<span class="flex gap-1">
		{#each methods as method, index (`${method.provider}:${method.providerId ?? index}`)}
			<Badge.Root
				title={method.providerId ? `${method.label} account ${method.providerId}` : method.label}
			>
				<ProviderIcon.Root src={method.iconUrl} fallback={signInMethodIcon(method)} />
				{method.label}
			</Badge.Root>
		{/each}
	</span>
{:else}
	<span class="text-xs text-zinc-400 italic">None</span>
{/if}
