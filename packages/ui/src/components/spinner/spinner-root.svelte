<script lang="ts">
	import * as Icon from '../icon/index.js';
	import { SPINNER_ICON } from './spinner-icon.js';

	type Props = {
		/**
		 * Accessible label. Leave it out when the spinner sits inside a control that already
		 * announces its busy state (e.g. a button with `aria-busy`); it is then hidden from
		 * assistive technology.
		 */
		label?: string;
		class?: string;
	};

	let { label, class: className }: Props = $props();
</script>

<span role={label ? 'status' : undefined} class="inline-flex">
	<Icon.Root icon={SPINNER_ICON} {label} class={['size-4 animate-spin', className].join(' ')} />
</span>
