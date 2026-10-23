<script module lang="ts">
	import { Button } from 'bits-ui';

	export type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger';

	export type Size = 'default' | 'icon';

	export type Props = Button.RootProps & {
		variant?: Variant;
		/** `icon` renders a square button for a single icon; give it an `aria-label`. */
		size?: Size;
		/**
		 * Shows a spinner and blocks clicks. An `onclick` handler that returns a promise does this
		 * automatically until the promise settles.
		 */
		loading?: boolean;
	};
</script>

<script lang="ts">
	import * as Spinner from '../spinner';

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

	const variants = {
		primary:
			'border-transparent bg-zinc-900 text-white hover:bg-zinc-700 focus-visible:outline-zinc-900',
		brand:
			'border-transparent bg-brand-500 text-white hover:bg-brand-600 focus-visible:outline-brand-500',
		secondary:
			'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 focus-visible:outline-zinc-400',
		ghost:
			'border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-zinc-400',
		danger:
			'border-transparent bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600'
	};

	const sizes = {
		default: 'px-4',
		icon: 'w-control shrink-0'
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
	{...rest}
	disabled={disabled || busy}
	aria-busy={busy || undefined}
	onclick={handleClick}
	class={[
		'inline-flex h-control cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress aria-busy:opacity-100 [&_svg]:size-4 [&_svg]:shrink-0',
		variants[variant],
		sizes[size],
		className
	]}
>
	{#if busy}
		<Spinner.Root />
	{/if}

	{#if !busy || size !== 'icon'}
		{@render children?.()}
	{/if}
</Button.Root>
