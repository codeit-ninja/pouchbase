<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type Props = {
		/** Value of the active item; one item is always active. */
		value: string;
		onValueChange?: (value: string) => void;
		/** Names the group for assistive technology, e.g. `Layout`. */
		'aria-label': string;
		disabled?: boolean;
		class?: string;
		children?: Snippet;
	};
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { ToggleGroup } from 'bits-ui';

	let { value, onValueChange, disabled, class: className, children, ...rest }: Props = $props();

	// Follows `value`, but switches right away on click so the indicator doesn't wait for the parent.
	let current = $derived(value);

	/** Moves the indicator under the active item; runs again whenever `current` changes. */
	const track: Attachment<HTMLElement> = (indicator) => {
		const root = indicator.parentElement;
		const active = root?.querySelector<HTMLElement>(
			`[data-segmented-value="${CSS.escape(current)}"]`
		);

		if (!root || !active) {
			return;
		}

		function place() {
			// Not laid out yet; a zero-width indicator would show as a thin line on the left.
			if (!root || !active?.offsetWidth) {
				return;
			}

			indicator.style.width = `${active.offsetWidth}px`;
			indicator.style.transform = `translateX(${active.offsetLeft}px)`;

			// Only animate after the first placement, so it doesn't slide in on page load.
			requestAnimationFrame(() => root.setAttribute('data-ready', ''));
		}

		// Fires once right away and again whenever the item gets (re)laid out.
		const observer = new ResizeObserver(place);
		observer.observe(active);

		return () => observer.disconnect();
	};

	function change(next: string) {
		// Clicking the active item would deselect it; keep it active instead.
		if (!next || next === current) {
			return;
		}

		current = next;
		onValueChange?.(next);
	}
</script>

<ToggleGroup.Root
	type="single"
	value={current}
	onValueChange={change}
	{disabled}
	{...rest}
	class={[
		'group/segmented relative inline-flex h-control items-stretch gap-0.5 rounded-lg bg-zinc-100 p-0.5',
		className
	]}
>
	<span
		{@attach track}
		aria-hidden="true"
		class="absolute top-0.5 bottom-0.5 left-0 rounded-md bg-white opacity-0 shadow-sm ring-1 ring-zinc-900/5 group-data-ready/segmented:opacity-100 group-data-ready/segmented:transition-[transform,width] group-data-ready/segmented:duration-200 group-data-ready/segmented:ease-out motion-reduce:transition-none"
	></span>

	{@render children?.()}
</ToggleGroup.Root>
