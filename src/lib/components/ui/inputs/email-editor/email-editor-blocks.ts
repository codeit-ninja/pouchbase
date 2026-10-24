import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Fragment } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { BLOCK_DEFAULTS, columnWidths } from '#lib/mail/document.js';

/** The blocks with settings of their own in the inspector, from the inside out. */
export const BLOCK_TYPES = [
	'emailButton',
	'image',
	'emailSpacer',
	'horizontalRule',
	'emailColumn',
	'emailColumns',
	'emailSection',
	'paragraph',
	'heading',
	'bulletList',
	'orderedList',
	'blockquote'
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABELS: Record<BlockType, string> = {
	emailButton: 'Button',
	image: 'Image',
	emailSpacer: 'Spacer',
	horizontalRule: 'Divider',
	emailColumn: 'Column',
	emailColumns: 'Columns',
	emailSection: 'Section',
	paragraph: 'Text',
	heading: 'Heading',
	bulletList: 'List',
	orderedList: 'Numbered list',
	blockquote: 'Quote'
};

/** Blocks of text; only their spacing is set in the inspector. */
export const TEXT_BLOCK_TYPES: readonly BlockType[] = [
	'paragraph',
	'heading',
	'bulletList',
	'orderedList',
	'blockquote'
];

/** Blocks that hold paragraphs: the paragraphs in them are spaced by the block. */
const TEXT_CONTAINERS = new Set(['bulletList', 'orderedList', 'blockquote']);

export type SelectedBlock = { type: BlockType; position: number; node: ProseMirrorNode };

function isBlockType(name: string): name is BlockType {
	return (BLOCK_TYPES as readonly string[]).includes(name);
}

/**
 * The blocks around the selection that have settings, the innermost first. Of the text, only
 * one block is listed: the outermost list or quote the cursor is in, otherwise its paragraph or
 * heading.
 */
export function selectedBlocks(editor: Editor): SelectedBlock[] {
	const { selection } = editor.state;
	const blocks: SelectedBlock[] = [];

	let text: SelectedBlock | null = null;

	if (selection instanceof NodeSelection && isBlockType(selection.node.type.name)) {
		const block = {
			type: selection.node.type.name,
			position: selection.from,
			node: selection.node
		};

		if (TEXT_BLOCK_TYPES.includes(block.type)) {
			text = block;
		} else {
			blocks.push(block);
		}
	}

	const { $from } = selection;

	for (let depth = $from.depth; depth > 0; depth--) {
		const node = $from.node(depth);
		const type = node.type.name;

		if (!isBlockType(type)) {
			continue;
		}

		const block = { type, position: $from.before(depth), node };

		if (!TEXT_BLOCK_TYPES.includes(type)) {
			blocks.push(block);
		} else if (!text || TEXT_CONTAINERS.has(type)) {
			// A list or quote further out replaces the paragraph or list found so far.
			text = block;
		}
	}

	return text ? [text, ...blocks] : blocks;
}

/** Changes attributes of the block at `position`. */
export function updateBlock(editor: Editor, position: number, attrs: Record<string, unknown>) {
	const node = editor.state.doc.nodeAt(position);

	if (!node) {
		return;
	}

	editor.view.dispatch(
		editor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, ...attrs })
	);
}

/** Whether the block can move up (`-1`) or down (`1`) among its siblings. */
export function canMoveBlock(editor: Editor, position: number, direction: -1 | 1) {
	const $position = editor.state.doc.resolve(position);
	const index = $position.index();

	return direction === -1 ? index > 0 : index < $position.parent.childCount - 1;
}

function select(editor: Editor, position: number) {
	const { state } = editor;
	const node = state.doc.nodeAt(position);
	const tr = state.tr;

	tr.setSelection(
		node && NodeSelection.isSelectable(node) && node.isAtom
			? NodeSelection.create(tr.doc, position)
			: TextSelection.near(tr.doc.resolve(position + 1))
	);
	editor.view.dispatch(tr.scrollIntoView());
	editor.view.focus();
}

/** Swaps the block with its sibling above (`-1`) or below (`1`). */
export function moveBlock(editor: Editor, position: number, direction: -1 | 1) {
	if (!canMoveBlock(editor, position, direction)) {
		return;
	}

	const { state } = editor;
	const node = state.doc.nodeAt(position)!;
	const $position = state.doc.resolve(position);
	const sibling = $position.parent.child($position.index() + direction);
	const tr = state.tr;

	if (direction === -1) {
		const target = position - sibling.nodeSize;

		tr.delete(position, position + node.nodeSize).insert(target, node);
		editor.view.dispatch(tr);
		select(editor, target);
	} else {
		tr.insert(position + node.nodeSize + sibling.nodeSize, node).delete(
			position,
			position + node.nodeSize
		);
		editor.view.dispatch(tr);
		select(editor, position + sibling.nodeSize);
	}
}

export function duplicateBlock(editor: Editor, position: number) {
	const node = editor.state.doc.nodeAt(position);

	if (!node) {
		return;
	}

	editor.view.dispatch(editor.state.tr.insert(position + node.nodeSize, node.copy(node.content)));
	select(editor, position + node.nodeSize);
}

/** Deletes the block; deleting the last column deletes the columns. */
export function deleteBlock(editor: Editor, position: number) {
	const { state } = editor;
	const node = state.doc.nodeAt(position);

	if (!node) {
		return;
	}

	const $position = state.doc.resolve(position);

	if (node.type.name === 'emailColumn' && $position.parent.childCount === 1) {
		deleteBlock(editor, $position.before());

		return;
	}

	const tr = state.tr.delete(position, position + node.nodeSize);

	// The document always keeps one block to type in.
	if (tr.doc.childCount === 0) {
		tr.insert(0, state.schema.nodes.paragraph.create());
	}

	editor.view.dispatch(tr);
	editor.view.focus();
}

/** Width presets per number of columns, in percent. */
export const COLUMN_LAYOUTS: Record<number, { label: string; widths: number[] }[]> = {
	1: [{ label: 'Full', widths: [100] }],
	2: [
		{ label: '1:1', widths: [50, 50] },
		{ label: '1:2', widths: [33, 67] },
		{ label: '2:1', widths: [67, 33] }
	],
	3: [
		{ label: '1:1:1', widths: [33, 34, 33] },
		{ label: '1:2:1', widths: [25, 50, 25] }
	],
	4: [{ label: '1:1:1:1', widths: [25, 25, 25, 25] }]
};

/**
 * Gives the columns these widths, adding or removing columns to match; the content of removed
 * columns moves into the last column that remains.
 */
export function setColumnLayout(editor: Editor, position: number, widths: number[]) {
	const { state } = editor;
	const node = state.doc.nodeAt(position);

	if (!node || node.type.name !== 'emailColumns') {
		return;
	}

	const columnType = state.schema.nodes.emailColumn;
	const existing: ProseMirrorNode[] = [];

	node.forEach((child) => existing.push(child));

	const columns = widths.map((width, index) => {
		const current = existing[index];

		if (!current) {
			return columnType.create({ width }, state.schema.nodes.paragraph.create());
		}

		// The last column takes the content of the columns that are removed.
		const extra =
			index === widths.length - 1
				? existing
						.slice(widths.length)
						.reduce((content, column) => content.append(column.content), Fragment.empty)
				: Fragment.empty;

		return columnType.create({ ...current.attrs, width }, current.content.append(extra));
	});

	editor.view.dispatch(
		state.tr.replaceWith(position + 1, position + node.nodeSize - 1, Fragment.fromArray(columns))
	);
}

/** The narrowest column, in percent; `columnWidths` ignores narrower ones. */
export const MIN_COLUMN_WIDTH = 10;

/** The widths of the columns of a row, in percent; they add up to 100. */
export function rowWidths(row: ProseMirrorNode) {
	return columnWidths(row.toJSON().content ?? []);
}

/** The column that gives or takes the difference when column `index` is resized. */
function neighborColumn(widths: number[], index: number) {
	return index < widths.length - 1 ? index + 1 : index - 1;
}

/** The widest column `index` can get, at the cost of the column next to it. */
export function maxColumnWidth(widths: number[], index: number) {
	const neighbor = neighborColumn(widths, index);

	return neighbor < 0 ? 100 : widths[index] + widths[neighbor] - MIN_COLUMN_WIDTH;
}

/**
 * The widths after giving column `index` `width` percent. The column next to it (the one before
 * it, for the last column) gives or takes the difference, so the others keep their width.
 */
export function resizedColumnWidths(widths: number[], index: number, width: number) {
	const neighbor = neighborColumn(widths, index);

	if (neighbor < 0) {
		return widths;
	}

	const pair = widths[index] + widths[neighbor];
	const next = Math.round(Math.min(Math.max(width, MIN_COLUMN_WIDTH), pair - MIN_COLUMN_WIDTH));
	const result = [...widths];

	result[index] = next;
	result[neighbor] = pair - next;

	return result;
}

/** Sets the widths of the columns of the row at `position` in `tr`. */
export function setColumnWidths(tr: Transaction, position: number, widths: number[]) {
	const row = tr.doc.nodeAt(position);

	if (!row || row.type.name !== 'emailColumns') {
		return tr;
	}

	row.forEach((column, offset, index) => {
		tr.setNodeMarkup(position + 1 + offset, undefined, { ...column.attrs, width: widths[index] });
	});

	return tr;
}

/** The row a column is in, and the column's index in it; `null` when it isn't in a row. */
export function columnRow(editor: Editor, columnPosition: number) {
	const $column = editor.state.doc.resolve(columnPosition);

	if ($column.parent.type.name !== 'emailColumns') {
		return null;
	}

	return { row: $column.parent, position: $column.before(), index: $column.index() };
}

/** Gives the column at `columnPosition` `width` percent; see `resizedColumnWidths`. */
export function resizeColumn(editor: Editor, columnPosition: number, width: number) {
	const parent = columnRow(editor, columnPosition);

	if (parent) {
		const widths = resizedColumnWidths(rowWidths(parent.row), parent.index, width);

		editor.view.dispatch(setColumnWidths(editor.state.tr, parent.position, widths));
	}
}

const paragraph: JSONContent = { type: 'paragraph' };

/** The blocks of the Insert menu. */
export const INSERTABLE: {
	label: string;
	description: string;
	icon: string;
	content: () => JSONContent;
}[] = [
	{
		label: 'Section',
		description: 'A box with its own background',
		icon: 'lucide:square',
		content: () => ({
			type: 'emailSection',
			attrs: { backgroundColor: '#f4f4f5' },
			content: [paragraph]
		})
	},
	{
		label: 'Two columns',
		description: 'Side by side, stacked on phones',
		icon: 'lucide:columns-2',
		content: () => ({
			type: 'emailColumns',
			content: [50, 50].map((width) => ({
				type: 'emailColumn',
				attrs: { width },
				content: [paragraph]
			}))
		})
	},
	{
		label: 'Three columns',
		description: 'Side by side, stacked on phones',
		icon: 'lucide:columns-3',
		content: () => ({
			type: 'emailColumns',
			content: [33, 34, 33].map((width) => ({
				type: 'emailColumn',
				attrs: { width },
				content: [paragraph]
			}))
		})
	},
	{
		label: 'Spacer',
		description: 'Empty space between blocks',
		icon: 'lucide:move-vertical',
		content: () => ({ type: 'emailSpacer', attrs: { height: BLOCK_DEFAULTS.spacer.height } })
	},
	{
		label: 'Divider',
		description: 'A horizontal line',
		icon: 'lucide:minus',
		content: () => ({ type: 'horizontalRule' })
	}
];

/**
 * Inserts a block where the cursor is: in place of an empty paragraph, otherwise below the
 * paragraph (or other block) the cursor is in. The cursor moves into the new block.
 */
export function insertBlock(editor: Editor, content: JSONContent) {
	const { state } = editor;
	const { $from } = state.selection;
	const block = $from.depth > 0 ? $from.before($from.depth) : 0;
	const parent = $from.depth > 0 ? $from.parent : null;
	const replace = !!parent && parent.isTextblock && parent.content.size === 0;
	const start = replace
		? block
		: $from.depth > 0
			? $from.after($from.depth)
			: state.doc.content.size;
	const range = replace ? { from: block, to: block + parent!.nodeSize } : start;

	editor.chain().focus().insertContentAt(range, content).run();

	const tr = editor.state.tr;
	const target = Math.min(start + 1, tr.doc.content.size);

	editor.view.dispatch(
		tr.setSelection(TextSelection.near(tr.doc.resolve(target))).scrollIntoView()
	);
	editor.view.focus();
}
