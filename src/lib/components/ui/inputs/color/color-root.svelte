<script module lang="ts">
	import type { ClassValue } from 'svelte/elements';

	export type Props = {
		/** A color like `#18181b`. */
		value?: string;
		id?: string;
		disabled?: boolean;
		class?: ClassValue;
		onValueChange?: (value: string) => void;
		'aria-invalid'?: boolean | 'true' | 'false';
		'aria-describedby'?: string;
		'aria-labelledby'?: string;
		'aria-label'?: string;
	};
</script>

<script lang="ts">
	let {
		value = $bindable('#000000'),
		id,
		disabled = false,
		class: className,
		onValueChange,
		...aria
	}: Props = $props();

	const COLOR = /^#[0-9a-f]{6}$/i;

	// What is typed; only a complete color is passed on.
	let text = $derived(value);

	function set(next: string) {
		value = next.toLowerCase();
		onValueChange?.(value);
	}

	function input(event: Event & { currentTarget: HTMLInputElement }) {
		const typed = event.currentTarget.value.trim();
		const color = typed.startsWith('#') ? typed : `#${typed}`;

		text = event.currentTarget.value;

		if (COLOR.test(color)) {
			set(color);
		}
	}
</script>

<!-- A color: a swatch that opens the system color picker, and the hex code to type. -->
<div
	class={[
		'flex h-control items-center gap-2 rounded-md border border-zinc-300 bg-white pr-3 pl-1 shadow-xs focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10',
		disabled && 'cursor-not-allowed opacity-50',
		className
	]}
>
	<input
		type="color"
		{value}
		{disabled}
		tabindex="-1"
		aria-hidden="true"
		class="size-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-zinc-200 [&::-webkit-color-swatch-wrapper]:p-0"
		oninput={(event) => set(event.currentTarget.value)}
	/>
	<input
		{id}
		type="text"
		value={text}
		{disabled}
		spellcheck="false"
		autocomplete="off"
		maxlength="7"
		{...aria}
		class="min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-900 uppercase outline-none disabled:cursor-not-allowed"
		oninput={input}
		onblur={() => (text = value)}
	/>
</div>
