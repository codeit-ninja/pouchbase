<script module lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	export type Props = HTMLAttributes<HTMLUListElement> & {
		/** Number of items, for the position announced after a move. */
		count: number;
		/** Called with the old and the new index; the caller moves the item in its data. */
		onReorder: (from: number, to: number) => void;
		/** Column labels above the items; use the same widths and gaps as the items to line them up. */
		header?: Snippet;
	};
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { on } from 'svelte/events';
	import { setSortableContext } from './sortable-context';

	let { count, onReorder, header, children, class: className, ...rest }: Props = $props();

	/** Matches the `duration-200` of the items. */
	const DURATION = 200;
	const EASING = 'cubic-bezier(0.2, 0, 0, 1)';
	/** Distance from the edge of the scroll container that starts scrolling, in pixels. */
	const SCROLL_EDGE = 56;

	type Slot = { top: number; height: number };

	let list: HTMLUListElement | null = null;

	let dragging = $state<number | null>(null);
	let target = $state<number | null>(null);
	let delta = $state(0);
	let dropping = $state(false);
	let announcement = $state('');

	// Measured when a drag starts, relative to the top of the list.
	let slots = $state<Slot[]>([]);
	let shift = 0;
	let startY = 0;
	let pointerY = 0;
	let startScroll = 0;
	let scroller: HTMLElement | null = null;
	let frame = 0;
	let cleanup: (() => void)[] = [];

	const placeholder = $derived(
		dragging !== null && target !== null && slots[dragging]
			? { top: landing(target), height: slots[dragging].height }
			: null
	);

	function reducedMotion() {
		return matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function items() {
		return list ? [...list.querySelectorAll<HTMLElement>(':scope > [data-sortable-index]')] : [];
	}

	function scrollParent(node: HTMLElement) {
		for (let parent = node.parentElement; parent; parent = parent.parentElement) {
			const { overflowY } = getComputedStyle(parent);

			if (/auto|scroll/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
				return parent;
			}
		}

		return document.scrollingElement as HTMLElement | null;
	}

	/** Top of the dragged item once it lands at `to`. */
	function landing(to: number) {
		const from = dragging === null ? undefined : slots[dragging];
		const slot = slots[to];

		if (dragging === null || !from || !slot) {
			return 0;
		}

		return to > dragging ? slot.top + slot.height - from.height : slot.top;
	}

	function announce(to: number) {
		announcement = `Moved to position ${to + 1} of ${count}`;
	}

	/** Follows the pointer and works out where the dragged item would land. */
	function update() {
		if (dragging === null || dropping) {
			return;
		}

		const from = dragging;
		const slot = slots[from];
		const known = slots.filter(Boolean);
		const first = known[0];
		const last = known[known.length - 1];
		const scrolled = (scroller?.scrollTop ?? 0) - startScroll;

		// Kept within the list, so it can't be dragged out of it.
		delta = Math.min(
			Math.max(pointerY - startY + scrolled, first.top - slot.top),
			last.top + last.height - slot.top - slot.height
		);

		const center = slot.top + delta + slot.height / 2;
		let next = from;

		slots.forEach((other, index) => {
			const middle = other.top + other.height / 2;

			if (index > from && center > middle) {
				next = Math.max(next, index);
			}

			if (index < from && center < middle) {
				next = Math.min(next, index);
			}
		});

		target = next;
	}

	/** Scrolls the container while the pointer is near its top or bottom edge. */
	function autoscroll() {
		if (dragging === null || dropping) {
			return;
		}

		if (scroller) {
			const rect = scroller.getBoundingClientRect();
			const top = Math.max(rect.top, 0);
			const bottom = Math.min(rect.bottom, innerHeight);
			let speed = 0;

			if (pointerY < top + SCROLL_EDGE) {
				speed = pointerY - (top + SCROLL_EDGE);
			} else if (pointerY > bottom - SCROLL_EDGE) {
				speed = pointerY - (bottom - SCROLL_EDGE);
			}

			if (speed) {
				scroller.scrollTop += Math.max(-16, Math.min(16, Math.round(speed / 4)));
				update();
			}
		}

		frame = requestAnimationFrame(autoscroll);
	}

	function stopListening() {
		cancelAnimationFrame(frame);
		cleanup.forEach((stop) => stop());
		cleanup = [];
	}

	/** Lets go of the dragged item: it settles into its slot, then the list is reordered. */
	async function release(commit: boolean) {
		if (dragging === null || dropping) {
			return;
		}

		stopListening();

		const from = dragging;
		const to = commit ? (target ?? from) : from;

		target = to;
		dropping = true;
		delta = landing(to) - slots[from].top;

		if (!reducedMotion()) {
			await new Promise((resolve) => setTimeout(resolve, DURATION));
		}

		if (to !== from) {
			onReorder(from, to);
			announce(to);
		}

		// Cleared together with the reorder, so the items don't jump.
		dragging = null;
		target = null;
		delta = 0;
		dropping = false;
	}

	setSortableContext({
		get dragging() {
			return dragging;
		},
		get dropping() {
			return dropping;
		},
		offset(index) {
			if (dragging === null) {
				return 0;
			}

			if (index === dragging) {
				return delta;
			}

			if (target === null) {
				return 0;
			}

			if (index > dragging && index <= target) {
				return -shift;
			}

			if (index < dragging && index >= target) {
				return shift;
			}

			return 0;
		},
		grab(index, event) {
			if (dragging !== null || dropping || event.button !== 0 || !list) {
				return;
			}

			const origin = list.getBoundingClientRect().top;
			const measured: Slot[] = [];

			for (const element of items()) {
				const rect = element.getBoundingClientRect();

				measured[Number(element.dataset.sortableIndex)] = {
					top: rect.top - origin,
					height: rect.height
				};
			}

			if (!measured[index]) {
				return;
			}

			// Stops text from being selected; the handle keeps focus for the arrow keys.
			event.preventDefault();
			(event.currentTarget as HTMLElement | null)?.focus();

			slots = measured;
			shift = measured[index].height + (parseFloat(getComputedStyle(list).rowGap) || 0);
			scroller = scrollParent(list);
			startScroll = scroller?.scrollTop ?? 0;
			startY = pointerY = event.clientY;
			dragging = index;
			target = index;
			delta = 0;

			cleanup = [
				on(window, 'pointermove', (move) => {
					pointerY = move.clientY;
					update();
				}),
				on(window, 'pointerup', () => release(true)),
				on(window, 'pointercancel', () => release(false)),
				on(window, 'blur', () => release(false)),
				on(
					window,
					'keydown',
					(key) => {
						if (key.key === 'Escape') {
							// Cancels the drag without closing the sheet or dialog around the list.
							key.preventDefault();
							key.stopPropagation();
							release(false);
						}
					},
					{ capture: true }
				)
			];

			if (scroller) {
				cleanup.push(
					on(scroller === document.scrollingElement ? window : scroller, 'scroll', update)
				);
			}

			frame = requestAnimationFrame(autoscroll);
		},
		async move(from, to) {
			if (dragging !== null || from === to || to < 0 || to >= count) {
				return;
			}

			const before = new Map(
				items().map((element) => [element, element.getBoundingClientRect().top])
			);

			onReorder(from, to);
			announce(to);
			await tick();

			if (reducedMotion()) {
				return;
			}

			// Slides the items from their old to their new place.
			for (const [element, top] of before) {
				const distance = top - element.getBoundingClientRect().top;

				if (distance) {
					element.animate([{ transform: `translateY(${distance}px)` }, { transform: 'none' }], {
						duration: DURATION,
						easing: EASING
					});
				}
			}
		}
	});

	$effect(() => stopListening);
</script>

<div
	data-dragging={dragging !== null || undefined}
	class={[
		'flex flex-col gap-1 data-dragging:cursor-grabbing data-dragging:select-none data-dragging:**:cursor-grabbing',
		className
	]}
>
	{#if header}
		<div
			class="flex h-6 items-center gap-3 border-x border-transparent pr-2 pl-1 text-xs font-medium text-zinc-500"
			aria-hidden="true"
		>
			{@render header()}
		</div>
	{/if}

	<div class="relative">
		{#if placeholder}
			<!-- Where the dragged item lands when it is let go. -->
			<div
				class="pointer-events-none absolute inset-x-0 rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-100/60 transition-[top] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
				style:top="{placeholder.top}px"
				style:height="{placeholder.height}px"
			></div>
		{/if}

		<ul {...rest} bind:this={list} class="relative flex flex-col gap-1.5">
			{@render children?.()}
		</ul>
	</div>
</div>

<div class="sr-only" aria-live="polite">{announcement}</div>
