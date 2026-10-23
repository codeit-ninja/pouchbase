import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Fragment } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { BLOCK_DEFAULTS } from '#lib/mail/document.js';

/** The blocks with settings of their own in the inspector, from the inside out. */
export const BLOCK_TYPES = [
	'emailButton',
	'image',
	'emailSpacer',
	'horizontalRule',
	'emailColumn',
	'emailColumns',
	'emailSection'
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABELS: Record<BlockType, string> = {
	emailButton: 'Button',
	image: 'Image',
	emailSpacer: 'Spacer',
	horizontalRule: 'Divider',
	emailColumn: 'Column',
	emailColumns: 'Columns',
	emailSection: 'Section'
};

export type SelectedBlock = { type: BlockType; position: number; node: ProseMirrorNode };

function isBlockType(name: string): name is BlockType {
	return (BLOCK_TYPES as readonly string[]).includes(name);
}

/** The blocks around the selection that have settings, the innermost first. */
export function selectedBlocks(editor: Editor): SelectedBlock[] {
	const { selection } = editor.state;
	const blocks: SelectedBlock[] = [];

	if (selection instanceof NodeSelection && isBlockType(selection.node.type.name)) {
		blocks.push({ type: selection.node.type.name, position: selection.from, node: selection.node });
	}

	const { $from } = selection;

	for (let depth = $from.depth; depth > 0; depth--) {
		const node = $from.node(depth);

		if (isBlockType(node.type.name)) {
			blocks.push({ type: node.type.name, position: $from.before(depth), node });
		}
	}

	return blocks;
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
