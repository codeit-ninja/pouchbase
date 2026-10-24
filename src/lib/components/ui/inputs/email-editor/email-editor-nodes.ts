import { Extension, mergeAttributes, Node } from '@tiptap/core';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Image from '@tiptap/extension-image';
import type { EditorState } from '@tiptap/pm/state';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { ButtonSize } from '#lib/mail/document.js';
import {
	BLOCK_DEFAULTS,
	BLOCK_MARGINS,
	blockMargins,
	BUTTON_SIZE_STYLES
} from '#lib/mail/document.js';
import { resizedColumnWidths, rowWidths, setColumnWidths } from './email-editor-blocks';

/**
 * The blocks of the email editor, besides text: buttons, images, sections, columns, spacers and
 * dividers. Their attributes are what `#lib/mail/document.ts` renders into the email; in the
 * editor they are drawn with the same styles, with the email's colors from CSS variables
 * (`--mail-*`, set by the canvas).
 */

/** Attributes that are only stored in the document, not written into the editor's HTML. */
function stored(values: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(values).map(([name, value]) => [name, { default: value, rendered: false }])
	);
}

function css(declarations: Record<string, string | number | null | undefined | false>) {
	return Object.entries(declarations)
		.filter(([, value]) => value !== null && value !== undefined && value !== false && value !== '')
		.map(([property, value]) => `${property}:${value}`)
		.join(';');
}

const ALIGN_MARGIN = { left: '0 auto 0 0', center: '0 auto', right: '0 0 0 auto' } as const;

/** A margin from the document: a number of pixels, or `null` for the block's default. */
function marginAttribute(side: 'top' | 'bottom') {
	const data = `data-margin-${side}`;

	return {
		default: null,
		// Only from the editor's own HTML (copy and paste), not from margins of pasted web pages.
		parseHTML: (element: HTMLElement) => {
			const value = element.getAttribute(data);

			return value === null ? null : Number(value);
		},
		renderHTML: (attributes: Record<string, unknown>) => {
			const value = attributes[side === 'top' ? 'marginTop' : 'marginBottom'];

			return typeof value === 'number' ? { [data]: value, style: `margin-${side}:${value}px` } : {};
		}
	};
}

/**
 * The space above and below blocks (`marginTop`, `marginBottom`), for every block that has a
 * default in `BLOCK_MARGINS`. The canvas draws the defaults with CSS; set margins override them.
 */
export const BlockMargins = Extension.create({
	name: 'blockMargins',

	addGlobalAttributes() {
		return [
			{
				types: Object.keys(BLOCK_MARGINS),
				attributes: { marginTop: marginAttribute('top'), marginBottom: marginAttribute('bottom') }
			}
		];
	}
});

export const EmailButton = Node.create({
	name: 'emailButton',
	group: 'block',
	content: 'text*',
	marks: '',
	defining: true,

	addAttributes() {
		return {
			href: { default: '', parseHTML: (element) => element.getAttribute('href') ?? '' },
			...stored({
				size: BLOCK_DEFAULTS.button.size,
				backgroundColor: null,
				textColor: null,
				radius: BLOCK_DEFAULTS.button.radius,
				fullWidth: BLOCK_DEFAULTS.button.fullWidth
			})
		};
	},

	parseHTML() {
		return [{ tag: 'a[data-email-button]', priority: 100 }];
	},

	addKeyboardShortcuts() {
		return {
			// A label has one line: Enter continues with a paragraph below the button.
			Enter: ({ editor }) => {
				const { $from } = editor.state.selection;

				if ($from.parent.type.name !== this.name) {
					return false;
				}

				const after = $from.after();

				return editor
					.chain()
					.insertContentAt(after, { type: 'paragraph' })
					.setTextSelection(after + 1)
					.run();
			}
		};
	},

	renderHTML({ node, HTMLAttributes }) {
		const { href, ...rest } = HTMLAttributes;
		const size = BUTTON_SIZE_STYLES[node.attrs.size as ButtonSize] ?? BUTTON_SIZE_STYLES.medium;

		return [
			'div',
			mergeAttributes(rest, { 'data-email-button': '', 'data-href': href }),
			[
				'span',
				{
					class: 'email-button',
					style: css({
						display: node.attrs.fullWidth ? 'block' : 'inline-block',
						background: node.attrs.backgroundColor ?? 'var(--mail-button)',
						color: node.attrs.textColor ?? 'var(--mail-button-text)',
						'font-size': `${size.fontSize}px`,
						padding: size.padding,
						'border-radius': `${node.attrs.radius}px`
					})
				},
				0
			]
		];
	}
});

export const EmailImage = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			...stored({ width: BLOCK_DEFAULTS.image.width, align: 'center', href: null, radius: 0 })
		};
	},

	renderHTML({ node, HTMLAttributes }) {
		const spacing = blockMargins(node.attrs, BLOCK_MARGINS.image);
		const style = {
			width: node.attrs.width ? `${node.attrs.width}px` : '100%',
			'max-width': '100%',
			margin: ALIGN_MARGIN[node.attrs.align as keyof typeof ALIGN_MARGIN] ?? ALIGN_MARGIN.center,
			// After `margin`, which only places the image; the image is a block of its own.
			'margin-top': `${spacing.top}px`,
			'margin-bottom': `${spacing.bottom}px`,
			'border-radius': node.attrs.radius ? `${node.attrs.radius}px` : null
		};

		// An image from a variable is only known when the email is sent.
		if (typeof node.attrs.src === 'string' && node.attrs.src.includes('{{')) {
			return [
				'div',
				{ class: 'email-image-placeholder', style: css(style) },
				`Image: ${node.attrs.src}`
			];
		}

		return [
			'img',
			mergeAttributes(HTMLAttributes, {
				style: css({ display: 'block', height: 'auto', ...style })
			})
		];
	}
}).configure({ inline: false, allowBase64: false });

export const EmailDivider = HorizontalRule.extend({
	addAttributes() {
		return stored({ color: null, thickness: BLOCK_DEFAULTS.divider.thickness });
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			'hr',
			mergeAttributes(HTMLAttributes, {
				style: css({
					border: 0,
					'border-top': `${node.attrs.thickness}px solid ${node.attrs.color ?? BLOCK_DEFAULTS.divider.color}`
				})
			})
		];
	}
});

export const EmailSpacer = Node.create({
	name: 'emailSpacer',
	group: 'block',
	atom: true,
	selectable: true,

	addAttributes() {
		return stored({ height: BLOCK_DEFAULTS.spacer.height });
	},

	parseHTML() {
		return [{ tag: 'div[data-email-spacer]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-email-spacer': '',
				class: 'email-spacer',
				style: `height:${node.attrs.height}px`
			})
		];
	}
});

export const EmailSection = Node.create({
	name: 'emailSection',
	group: 'block',
	content: 'block+',
	isolating: true,
	defining: true,

	addAttributes() {
		return stored({
			backgroundColor: null,
			textColor: null,
			borderColor: null,
			padding: BLOCK_DEFAULTS.section.padding,
			radius: BLOCK_DEFAULTS.section.radius
		});
	},

	parseHTML() {
		return [{ tag: 'div[data-email-section]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		const { padding } = node.attrs;

		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-email-section': '',
				class: 'email-section',
				style: css({
					background: node.attrs.backgroundColor,
					color: node.attrs.textColor,
					border: node.attrs.borderColor ? `1px solid ${node.attrs.borderColor}` : null,
					padding: `${padding}px ${padding}px ${Math.max(0, padding - 16)}px`,
					'border-radius': `${node.attrs.radius}px`
				})
			}),
			0
		];
	}
});

/** A handle on the left edge of every column but the first, to drag the border between two. */
function columnHandles(state: EditorState) {
	const handles: Decoration[] = [];

	state.doc.descendants((node, position) => {
		if (node.type.name !== 'emailColumns') {
			return;
		}

		node.forEach((_, offset, index) => {
			if (index === 0) {
				return;
			}

			handles.push(
				Decoration.widget(
					position + 1 + offset + 1,
					() => {
						const handle = document.createElement('div');

						handle.className = 'email-column-resizer';
						handle.contentEditable = 'false';
						handle.dataset.row = String(position);
						handle.dataset.index = String(index);
						handle.title = 'Drag to resize the columns';

						return handle;
					},
					{ side: -1, ignoreSelection: true, key: `column-resizer-${position}-${index}` }
				)
			);
		});
	});

	return DecorationSet.create(state.doc, handles);
}

/**
 * Drags the border before column `index` of the row at `position`. While dragging, the widths
 * change without undo steps; letting go makes it one change, so undo restores the old widths.
 */
function dragColumnBorder(view: EditorView, event: PointerEvent, handle: HTMLElement) {
	const position = Number(handle.dataset.row);
	const index = Number(handle.dataset.index);
	const row = view.state.doc.nodeAt(position);
	const width = handle.closest('.email-columns')?.getBoundingClientRect().width;

	if (!row || row.type.name !== 'emailColumns' || !width) {
		return;
	}

	const start = rowWidths(row);
	let current = start;

	const apply = (widths: number[], history: boolean) => {
		view.dispatch(
			setColumnWidths(view.state.tr, position, widths).setMeta('addToHistory', history)
		);
	};

	const move = (moveEvent: PointerEvent) => {
		const delta = ((moveEvent.clientX - event.clientX) / width) * 100;
		const next = resizedColumnWidths(start, index - 1, start[index - 1] + delta);

		if (next.some((value, i) => value !== current[i])) {
			current = next;
			apply(next, false);
		}
	};

	const stop = () => {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', stop);
		window.removeEventListener('pointercancel', stop);
		document.body.classList.remove('email-column-resizing');

		if (current !== start) {
			apply(start, false);
			apply(current, true);
		}
	};

	window.addEventListener('pointermove', move);
	window.addEventListener('pointerup', stop);
	window.addEventListener('pointercancel', stop);
	document.body.classList.add('email-column-resizing');
}

export const EmailColumns = Node.create({
	name: 'emailColumns',
	group: 'block',
	content: 'emailColumn{1,4}',
	isolating: true,

	addAttributes() {
		return stored({ gap: BLOCK_DEFAULTS.columns.gap });
	},

	parseHTML() {
		return [{ tag: 'div[data-email-columns]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-email-columns': '',
				class: 'email-columns',
				style: `gap:${node.attrs.gap}px;--email-columns-gap:${node.attrs.gap}px`
			}),
			0
		];
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				props: {
					decorations: (state) => (this.editor.isEditable ? columnHandles(state) : null),
					handleDOMEvents: {
						pointerdown: (view, event) => {
							const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>(
								'.email-column-resizer'
							);

							if (!handle || !view.editable || event.button !== 0) {
								return false;
							}

							event.preventDefault();
							dragColumnBorder(view, event, handle);

							return true;
						}
					}
				}
			})
		];
	}
});

export const EmailColumn = Node.create({
	name: 'emailColumn',
	content: 'block+',
	isolating: true,

	addAttributes() {
		return stored({ width: null, verticalAlign: 'top', backgroundColor: null, padding: 0 });
	},

	parseHTML() {
		return [{ tag: 'div[data-email-column]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		const { padding } = node.attrs;
		const align = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

		return [
			'div',
			mergeAttributes(HTMLAttributes, {
				'data-email-column': '',
				class: 'email-column',
				style: css({
					flex: `${node.attrs.width ?? 1} 1 0`,
					'align-self': align[node.attrs.verticalAlign as keyof typeof align] ?? 'flex-start',
					background: node.attrs.backgroundColor,
					padding: padding ? `${padding}px ${padding}px ${Math.max(0, padding - 16)}px` : null,
					'border-radius': node.attrs.backgroundColor ? '6px' : null
				})
			}),
			0
		];
	}
});

/** Marks variable tags (`{{name}}`, `{{#each items}}`) so they stand out while writing. */
export const VariableHighlight = Extension.create({
	name: 'variableHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				props: {
					decorations(state) {
						const decorations: Decoration[] = [];

						state.doc.descendants((node, position) => {
							if (!node.isText || !node.text) {
								return;
							}

							for (const match of node.text.matchAll(/\{\{[^{}]*\}\}/g)) {
								const start = position + match.index;
								const block = /^\{\{\s*(?:[#/]|else\b)/.test(match[0]);

								decorations.push(
									Decoration.inline(start, start + match[0].length, {
										class: block ? 'email-variable email-variable-block' : 'email-variable'
									})
								);
							}
						});

						return DecorationSet.create(state.doc, decorations);
					}
				}
			})
		];
	}
});

/** Blocks that hold other blocks, and keep an empty paragraph to type in when they are empty. */
const CONTAINERS = new Set(['emailColumn', 'emailSection']);

/**
 * A block dropped into an empty column or section takes the place of its empty paragraph,
 * instead of landing next to it.
 */
export const DropIntoEmpty = Extension.create({
	name: 'dropIntoEmpty',

	addProseMirrorPlugins() {
		return [
			new Plugin({
				appendTransaction(transactions, _, state) {
					if (!transactions.some((tr) => tr.getMeta('uiEvent') === 'drop')) {
						return null;
					}

					const { $from } = state.selection;

					for (let depth = $from.depth; depth > 0; depth--) {
						const container = $from.node(depth);

						if (!CONTAINERS.has(container.type.name)) {
							continue;
						}

						if (container.childCount !== 2) {
							return null;
						}

						const empty = [0, 1].find((index) => {
							const child = container.child(index);

							return child.type.name === 'paragraph' && child.content.size === 0;
						});

						if (empty === undefined) {
							return null;
						}

						const from = $from.start(depth) + (empty === 0 ? 0 : container.child(0).nodeSize);

						return state.tr.delete(from, from + container.child(empty).nodeSize);
					}

					return null;
				}
			})
		];
	}
});
