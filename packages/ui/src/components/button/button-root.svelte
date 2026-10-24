<script module lang="ts">
	import { Button } from 'bits-ui';

	export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

	export type Size = 'default' | 'icon' | 'icon-sm';

	export type Props = Button.RootProps & {
		variant?: Variant;
		/**
		 * `icon` renders a square button for a single icon; give it an `aria-label`. `icon-sm` is a
		 * smaller one for inline actions next to text, e.g. resetting a value.
		 */
		size?: Size;
		/**
		 * Shows a spinner and blocks clicks. An `onclick` handler that returns a promise does this
		 * automatically until the promise settles.
		 */
		loading?: boolean;
	};
</script>

<script lang="ts">
	import * as Spinner from '../spinner/index.js';

	let {
		variant = 'primary',
		size = 'default',
		loading = false,
		disabled,
		onclick,
		ref = $bindable(null),
		children,
		class: className,
		...rest
	}: Props = $props();

	let pending = $state(false);

	const busy = $derived(loading || pending);

	// A <button> without a type submits its form; only `Form.Submit` (or an explicit type) should.
	const defaults = $derived((rest.href === undefined ? { type: 'button' } : {}) as object);

	const variants = {
		primary:
			'border-transparent bg-zinc-900 text-white hover:bg-zinc-700 focus-visible:outline-zinc-900',
		secondary:
			'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 focus-visible:outline-zinc-400',
		ghost:
			'border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-zinc-400',
		danger:
			'border-transparent bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600'
	};

	const sizes = {
		default: 'h-control px-3 [&_svg]:size-4',
		icon: 'size-control shrink-0 [&_svg]:size-4',
		'icon-sm': 'size-6 shrink-0 [&_svg]:size-3.5'
	};

	async function handleClick(event: MouseEvent) {
		const result: unknown = (onclick as ((event: MouseEvent) => unknown) | undefined)?.(event);

		if (result instanceof Promise) {
			pending = true;

			try {
				await result;
			} finally {
				pending = false;
			}
		}
	}
</script>

<Button.Root
	bind:ref
	{...defaults}
	{...rest}
	disabled={disabled || busy}
	aria-busy={busy || undefined}
	onclick={handleClick}
	class={[
		'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress aria-busy:opacity-100 [&_svg]:shrink-0',
		variants[variant],
		sizes[size],
		className
	]}
>
	{#if busy}
		<Spinner.Root />
	{/if}

	{#if !busy || size === 'default'}
		{@render children?.()}
	{/if}
</Button.Root>
