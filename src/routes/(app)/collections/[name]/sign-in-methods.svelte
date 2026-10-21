<script lang="ts">
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import { signInMethodInfo, type SignInMethod } from '#lib/auth/sign-in-methods.js';

	type Props = {
		methods: SignInMethod[];
	};

	let { methods }: Props = $props();
</script>

<!-- How a user can sign in: one badge per linked OAuth account, plus one for a password. -->
{#if methods.length}
	<span class="flex gap-1">
		{#each methods as method, index (`${method.provider}:${method.providerId ?? index}`)}
			{@const info = signInMethodInfo(method.provider)}

			<Badge.Root
				title={method.providerId ? `${info.label} account ${method.providerId}` : info.label}
			>
				<Icon.Root icon={info.icon} />
				{info.label}
			</Badge.Root>
		{/each}
	</span>
{:else}
	<span class="text-xs text-zinc-400 italic">None</span>
{/if}
