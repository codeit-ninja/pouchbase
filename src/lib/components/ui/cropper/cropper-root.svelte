<script module lang="ts">
	import type { Snippet } from 'svelte';

	/** A rectangle in pixels of the content (not of the screen). */
	export type Area = { x: number; y: number; width: number; height: number };

	export type Props = {
		/** Size of the content in its own pixels, e.g. an image's natural size. */
		width: number;
		height: number;
		/** Selected area, in content pixels. */
		area: Area;
		/** Width / height to keep while resizing, or `null` for a free selection. */
		aspect?: number | null;
		/**
		 * Largest height on screen, as CSS (e.g. `60svh`). Limits the width instead, so the content
		 * keeps its aspect ratio.
		 */
		maxHeight?: string;
		class?: string;
		/** Called when the user is done changing the area (drag ended, arrow key pressed). */
		oncommit?: (area: Area) => void;
		/** The content to crop, e.g. a canvas; it should fill the root's width. */
		children?: Snippet;
	};
</script>

<script lang="ts">
	let {
		width,
		height,
		area = $bindable(),
		aspect = null,
		maxHeight,
		class: className,
		oncommit,
		children
	}: Props = $props();

	type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

	const MIN_SIZE = 16;
	const handles: Exclude<Handle, 'move'>[] = ['nw', 'ne', 'sw', 'se'];

	let renderedWidth = $state(0);

	/** Content pixels per screen pixel. */
	const scale = $derived(renderedWidth ? width / renderedWidth : 1);

	let drag: { handle: Handle; startX: number; startY: number; start: Area } | null = null;

	function clamp(value: number, min: number, max: number) {
		return Math.min(max, Math.max(min, value));
	}

	function percent(value: number, total: number) {
		return `${(value / total) * 100}%`;
	}

	function begin(event: PointerEvent, handle: Handle) {
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = { handle, startX: event.clientX, startY: event.clientY, start: { ...area } };
	}

	function move(event: PointerEvent) {
		if (!drag) {
			return;
		}

		const dx = (event.clientX - drag.startX) * scale;
		const dy = (event.clientY - drag.startY) * scale;
		const { start, handle } = drag;

		if (handle === 'move') {
			area = {
				...start,
				x: clamp(start.x + dx, 0, width - start.width),
				y: clamp(start.y + dy, 0, height - start.height)
			};

			return;
		}

		// The corner opposite the dragged one stays where it is.
		const left = handle === 'nw' || handle === 'sw';
		const top = handle === 'nw' || handle === 'ne';
		const anchorX = left ? start.x + start.width : start.x;
		const anchorY = top ? start.y + start.height : start.y;
		const maxWidth = left ? anchorX : width - anchorX;
		const maxHeight = top ? anchorY : height - anchorY;

		let nextWidth = clamp(start.width + (left ? -dx : dx), MIN_SIZE, maxWidth);
		let nextHeight = clamp(start.height + (top ? -dy : dy), MIN_SIZE, maxHeight);

		if (aspect) {
			nextHeight = nextWidth / aspect;

			if (nextHeight > maxHeight) {
				nextHeight = maxHeight;
				nextWidth = nextHeight * aspect;
			}
		}

		area = {
			x: left ? anchorX - nextWidth : anchorX,
			y: top ? anchorY - nextHeight : anchorY,
			width: nextWidth,
			height: nextHeight
		};
	}

	function end() {
		if (drag) {
			oncommit?.(area);
		}

		drag = null;
	}

	/** Arrow keys move the selection; with Shift in bigger steps. */
	function keydown(event: KeyboardEvent) {
		const step = (event.shiftKey ? 10 : 1) * scale;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const delta = moves[event.key];

		if (delta) {
			event.preventDefault();
			area = {
				...area,
				x: clamp(area.x + delta[0], 0, width - area.width),
				y: clamp(area.y + delta[1], 0, height - area.height)
			};
			oncommit?.(area);
		}
	}
</script>

<div
	bind:clientWidth={renderedWidth}
	class={['relative mx-auto w-full overflow-hidden select-none', className]}
	style:aspect-ratio="{width} / {height}"
	style:max-width={maxHeight ? `calc(${maxHeight} * ${width / height})` : undefined}
>
	{@render children?.()}

	<!-- The selection; its shadow darkens everything outside it. -->
	<div
		role="slider"
		tabindex="0"
		aria-label="Crop area, use the arrow keys to move it"
		aria-valuenow={Math.round(area.x)}
		aria-valuetext="{Math.round(area.width)} × {Math.round(area.height)} at {Math.round(
			area.x
		)}, {Math.round(area.y)}"
		class="absolute cursor-move border border-white shadow-[0_0_0_9999px_rgb(9_9_11/0.55)] outline-none focus-visible:border-2"
		style:left={percent(area.x, width)}
		style:top={percent(area.y, height)}
		style:width={percent(area.width, width)}
		style:height={percent(area.height, height)}
		onpointerdown={(event) => begin(event, 'move')}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={end}
		onkeydown={keydown}
	>
		<!-- Rule-of-thirds guides. -->
		<div
			class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 [&>span]:border-white/30"
		>
			{#each { length: 9 }, index}
				<span class={[index % 3 < 2 && 'border-r', index < 6 && 'border-b']}></span>
			{/each}
		</div>

		{#each handles as handle (handle)}
			<span
				aria-hidden="true"
				class={[
					'absolute size-3 rounded-sm border border-zinc-900 bg-white',
					handle === 'nw' && '-top-1.5 -left-1.5 cursor-nwse-resize',
					handle === 'ne' && '-top-1.5 -right-1.5 cursor-nesw-resize',
					handle === 'sw' && '-bottom-1.5 -left-1.5 cursor-nesw-resize',
					handle === 'se' && '-right-1.5 -bottom-1.5 cursor-nwse-resize'
				]}
				onpointerdown={(event) => begin(event, handle)}
				onpointermove={move}
				onpointerup={end}
				onpointercancel={end}
			></span>
		{/each}
	</div>
</div>
