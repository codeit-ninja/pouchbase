<script lang="ts">
	import { Dialog } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...rest }: Dialog.TitleProps = $props();
</script>

<!-- Matches the current page in the topbar breadcrumb. -->
<Dialog.Title
	bind:ref
	{...rest}
	class={['truncate text-sm font-semibold text-zinc-900', className]}
/>
