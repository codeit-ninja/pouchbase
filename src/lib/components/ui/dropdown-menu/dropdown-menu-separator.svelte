<script lang="ts">
	import { DropdownMenu } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...rest }: DropdownMenu.SeparatorProps = $props();
</script>

<DropdownMenu.Separator bind:ref {...rest} class={['-mx-1.5 my-1 h-px bg-zinc-200', className]} />
