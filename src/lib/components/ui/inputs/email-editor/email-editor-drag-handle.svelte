<script lang="ts">
	import type { EditorView } from '@tiptap/pm/view';
	import type { Transaction } from '@tiptap/pm/state';
	import { NodeSelection } from '@tiptap/pm/state';
	import * as Button from '../../button/index.js';
	import * as Icon from '../../icon/index.js';
	import { getEmailEditorContext } from './email-editor-context';

	type Props = {
		/** The card around the editor: the handle is placed in it and shown while it is hovered. */
		container: HTMLElement | null;
	};

	let { container }: Props = $props();

	const context = getEmailEditorContext();

	/** The blocks that can be dragged: those in the email, a section or a column. */
	const BLOCKS = '.email-canvas > *, .email-section > *, .email-column > *';

	/** Height of the handle; it is centered on the block's first line. */
	const HANDLE_SIZE = 24;
	const FIRST_LINE = 32;
	/** Width of the strip left of a block that leads to its handle (the handle and its gap). */
	const GUTTER = HANDLE_SIZE + 12;

	let block = $state.raw<HTMLElement | null>(null);
	let box = $state({ top: 0, left: 0, width: 0, height: 0 });
	/** Where the handle ends on the left of the block, relative to the container. */
	let handleEnd = $state(0);
	let handle = $state<HTMLElement | null>(null);

	// Set while the block is dragged: it stays outlined, and selecting it doesn't hide the handle.
	let dragging = $state(false);

	const visible = $derived(!!block && !context.disabled);

	/** The position of the node `element` draws, or `-1`. */
	function positionOf(view: EditorView, element: HTMLElement) {
		let found = -1;

		view.state.doc.descendants((_, position) => {
			if (found >= 0) {
				return false;
			}

			if (view.nodeDOM(position) === element) {
				found = position;

				return false;
			}

			return true;
		});

		return found;
	}

	function show(element: HTMLElement) {
		// Measured once per block, not on every mouse move; typing hides the handle (see below).
		if (!container || element === block) {
			return;
		}

		const rect = element.getBoundingClientRect();
		const frame = container.getBoundingClientRect();

		block = element;
		box = {
			top: rect.top - frame.top,
			left: rect.left - frame.left,
			width: rect.width,
			height: rect.height
		};
		handleEnd = Math.min(box.left, resizerStart(element) - frame.left);
	}

	/**
	 * The left edge of the column resizer next to a block at the start of a column (see
	 * `email-editor-nodes.ts`), or `Infinity`. The handle goes left of it: over the resizer, the
	 * browser doesn't start dragging the handle.
	 */
	function resizerStart(element: HTMLElement) {
		const resizer = element.parentElement?.querySelector<HTMLElement>(
			':scope > .email-column-resizer'
		);

		return resizer ? resizer.getBoundingClientRect().left : Infinity;
	}

	/**
	 * Whether the pointer is in the strip left of the block, level with it: on the way to the
	 * handle. That strip can lie over another block (the column to the left), which must not take
	 * the handle over.
	 */
	function inGutter(event: MouseEvent) {
		const rect = block?.getBoundingClientRect();
		const frame = container?.getBoundingClientRect();

		return (
			!!rect &&
			!!frame &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom &&
			event.clientX < rect.left &&
			event.clientX >= frame.left + handleEnd - GUTTER
		);
	}

	$effect(() => {
		const editor = context.editor;
		const frame = container;

		if (!editor || !frame) {
			return;
		}

		const move = (event: MouseEvent) => {
			const target = event.target as HTMLElement;

			// With a button down the handle stays put: the browser only decides to start a drag after
			// the first moves, and takes what is under the pointer then; moving the handle away
			// would drag that instead (an image, or selected text). Selecting text with the mouse
			// doesn't move it around either.
			if (event.buttons !== 0 || handle?.contains(target) || inGutter(event)) {
				return;
			}

			const element = target.closest<HTMLElement>(BLOCKS);

			if (
				element &&
				editor.view.dom.contains(element) &&
				!element.matches('[contenteditable="false"]')
			) {
				show(element);
			} else if (!editor.view.dom.contains(target)) {
				block = null;
			}
		};
		const leave = () => {
			if (!dragging) {
				block = null;
			}
		};

		// Typing moves the blocks; the handle comes back on the next mouse move. Only changes to
		// the content count: focusing and blurring are transactions too, and pressing the handle
		// blurs the editor.
		const changed = ({ transaction }: { transaction: Transaction }) => {
			if (transaction.docChanged && !dragging) {
				block = null;
			}
		};

		frame.addEventListener('mousemove', move);
		frame.addEventListener('mouseleave', leave);
		window.addEventListener('resize', leave);
		editor.on('transaction', changed);

		return () => {
			frame.removeEventListener('mousemove', move);
			frame.removeEventListener('mouseleave', leave);
			window.removeEventListener('resize', leave);
			editor.off('transaction', changed);
		};
	});

	/** Selects the block, so the inspector shows its settings. */
	function selectBlock() {
		const view = context.editor?.view;
		const position = view && block ? positionOf(view, block) : -1;

		if (view && position >= 0) {
			view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
			view.focus();
		}
	}

	/**
	 * Starts ProseMirror's own drag of the block, as if it were selected and dragged: dropping it
	 * moves it to the drop cursor (into a column or section too), or copies it with Alt/Ctrl.
	 */
	function dragStart(event: DragEvent) {
		const view = context.editor?.view;
		const position = view && block ? positionOf(view, block) : -1;

		if (!view || !block || position < 0 || !event.dataTransfer) {
			event.preventDefault();

			return;
		}

		const selection = NodeSelection.create(view.state.doc, position);

		dragging = true;
		view.dispatch(view.state.tr.setSelection(selection));

		const slice = selection.content();
		const { dom, text } = view.serializeForClipboard(slice);
		const rect = block.getBoundingClientRect();

		event.dataTransfer.clearData();
		event.dataTransfer.setData('text/html', dom.innerHTML);
		event.dataTransfer.setData('text/plain', text);
		event.dataTransfer.effectAllowed = 'copyMove';
		// Held where the pointer is, level with the handle.
		event.dataTransfer.setDragImage(
			block,
			0,
			Math.min(rect.height, Math.max(0, event.clientY - rect.top))
		);

		// `node` makes the drop remove exactly this block when it moves.
		view.dragging = { slice, move: true, node: selection } as EditorView['dragging'];
	}

	// The drag starts outside the editor, so ProseMirror doesn't see it end when it is cancelled.
	function dragEnd() {
		const view = context.editor?.view;
		const current = view?.dragging;

		dragging = false;
		block = null;
		setTimeout(() => {
			if (view && view.dragging === current) {
				view.dragging = null;
			}
		}, 50);
	}
</script>

{#if visible}
	<!-- The block the handle moves; dashed while it is being dragged. -->
	<div
		aria-hidden="true"
		class={[
			'pointer-events-none absolute z-10 rounded outline-offset-2',
			dragging
				? 'bg-blue-500/5 outline-2 outline-blue-500/60 outline-dashed'
				: 'outline-1 outline-blue-500/40 outline-solid'
		]}
		style:top="{box.top}px"
		style:left="{box.left}px"
		style:width="{box.width}px"
		style:height="{box.height}px"
	></div>

	<!-- Pointer only: keyboard users move blocks with the inspector's Move up and Move down. -->
	<div
		bind:this={handle}
		class="absolute z-10 -translate-x-full pr-1.5"
		style:top="{box.top + (Math.min(box.height, FIRST_LINE) - HANDLE_SIZE) / 2}px"
		style:left="{handleEnd}px"
	>
		<Button.Root
			type="button"
			variant="ghost"
			size="icon-sm"
			draggable="true"
			tabindex={-1}
			aria-hidden="true"
			title="Drag to move, click to select"
			class={[
				'cursor-grab text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing',
				dragging && 'opacity-0'
			]}
			onclick={selectBlock}
			ondragstart={dragStart}
			ondragend={dragEnd}
		>
			<Icon.Root icon="lucide:grip-vertical" />
		</Button.Root>
	</div>
{/if}
