<script lang="ts">
	import type { HTMLImgAttributes } from 'svelte/elements';
	import logo from '#lib/assets/logo.svg';

	let { class: className, alt = 'Pouchbase', ...rest }: HTMLImgAttributes = $props();
</script>

<img src={logo} {alt} class={['size-6 shrink-0', className]} {...rest} />
