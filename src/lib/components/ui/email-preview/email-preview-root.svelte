<script module lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	export type Width = 'desktop' | 'mobile';

	export type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		/** The whole HTML document of the email. */
		html: string;
		subject?: string;
		/** Shown as the sender, e.g. `Acme <hello@acme.com>`. */
		from?: string;
		width?: Width;
	};
</script>

<script lang="ts">
	let { html, subject, from, width = 'desktop', class: className, ...rest }: Props = $props();
</script>

<!--
	An email as a mail client shows it. The HTML runs in a sandboxed frame without scripts, so the
	email can't reach the admin page.
-->
<div
	{...rest}
	class={['flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white', className]}
>
	{#if subject !== undefined || from}
		<div class="flex flex-col gap-0.5 border-b border-zinc-200 px-4 py-3 text-sm">
			<span class="truncate font-medium text-zinc-900">{subject || '(no subject)'}</span>
			{#if from}
				<span class="truncate text-xs text-zinc-500">From {from}</span>
			{/if}
		</div>
	{/if}

	<div class="flex min-h-0 flex-1 justify-center overflow-auto bg-zinc-100">
		<iframe
			title="Email preview"
			sandbox=""
			srcdoc={html}
			class={[
				'h-full min-h-[32rem] border-0 bg-white',
				width === 'mobile' ? 'w-[375px]' : 'w-full'
			]}
		></iframe>
	</div>
</div>
