<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import * as Button from '../button';
	import { getFormContext } from './form-context';

	type Props = Omit<HTMLButtonAttributes, 'type'> & {
		variant?: Button.Variant;
		size?: Button.Size;
	};

	let { ...rest }: Props = $props();

	const ctx = getFormContext();
</script>

<!-- Shows the spinner while the form is submitting. -->
<Button.Root type="submit" loading={ctx.form.pending > 0} {...rest} />
