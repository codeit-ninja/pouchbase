<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { getFieldContext } from './form-context';

	let { class: className, ...rest }: HTMLAttributes<HTMLUListElement> = $props();

	const ctx = getFieldContext();
	const issues = $derived(ctx.field.issues());
</script>

{#if issues?.length}
	<ul id="{ctx.id}-errors" {...rest} class={['text-sm text-red-600', className]}>
		{#each issues as issue (issue.message)}
			<li>{issue.message}</li>
		{/each}
	</ul>
{/if}
