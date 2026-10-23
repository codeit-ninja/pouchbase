<script module lang="ts">
	// Registers every icon used in `src` (see `vite/iconify.ts`), so icons render on the server too.
	import 'virtual:iconify';
</script>

<script lang="ts">
	import Icon from '@iconify/svelte';

	type Props = {
		/** Iconify name, e.g. `lucide:plus`. Literal strings only, so the build can find them. */
		icon: string;
		/** Accessible label. Without one the icon is decorative and hidden from assistive technology. */
		label?: string;
		class?: string;
	};

	let { icon, label, class: className }: Props = $props();
</script>

<Icon
	{icon}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
	class={['shrink-0', className].filter(Boolean).join(' ')}
/>
