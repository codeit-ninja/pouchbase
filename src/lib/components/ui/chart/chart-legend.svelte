<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Series } from './chart-root.svelte';
	import { fills } from './chart-colors';

	type Props = HTMLAttributes<HTMLUListElement> & {
		series: Pick<Series, 'name' | 'color'>[];
	};

	let { series, class: className, ...rest }: Props = $props();
</script>

<!-- Names the series of a chart with two or more; a single series is named by its title. -->
<ul {...rest} class={['flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600', className]}>
	{#each series as s (s.name)}
		<li class="flex items-center gap-1.5">
			<span aria-hidden="true" class={['size-2.5 rounded-sm', fills[s.color ?? 'primary']]}></span>
			{s.name}
		</li>
	{/each}
</ul>
