/**
 * The content of a visual template: the visual editor's document (Tiptap JSON), and how it is
 * rendered into email HTML: tables for sections and columns, and every style written inline,
 * because email clients ignore most CSS. Shared by the editor, the preview and the server.
 *
 * Variable tags (`{{name}}`, `{{#each items}}`) are kept as they are typed; a paragraph or list
 * item that holds nothing but a block tag is left out around it, so blocks can span paragraphs,
 * sections and the items of a list.
 */

import type { MailStyle } from './layout';

import { clampNumber, FONT_STACKS, hexColor } from './layout';
import { escapeHtml } from './template';

export type MailMark = { type: string; attrs?: Record<string, unknown> };

export type MailNode = {
	type: string;
	attrs?: Record<string, unknown>;
	content?: MailNode[];
	text?: string;
	marks?: MailMark[];
};

export const BUTTON_SIZES = ['small', 'medium', 'large'] as const;

export type ButtonSize = (typeof BUTTON_SIZES)[number];

export const ALIGNMENTS = ['left', 'center', 'right'] as const;

export type Alignment = (typeof ALIGNMENTS)[number];

export const VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'] as const;

/** Padding and text size per button size. */
export const BUTTON_SIZE_STYLES: Record<ButtonSize, { padding: string; fontSize: number }> = {
	small: { padding: '8px 14px', fontSize: 13 },
	medium: { padding: '12px 22px', fontSize: 15 },
	large: { padding: '16px 30px', fontSize: 17 }
};

/** Defaults of the blocks' settings, shared with the editor's nodes. */
export const BLOCK_DEFAULTS = {
	button: { size: 'medium' as ButtonSize, radius: 6, fullWidth: false },
	image: { width: null as number | null, radius: 0 },
	section: { padding: 24, radius: 8 },
	columns: { gap: 24 },
	spacer: { height: 24 },
	divider: { thickness: 1, color: '#e4e4e7' }
};

/** Font size of headings relative to the paragraphs. */
const HEADING_SCALE: Record<number, number> = { 1: 1.85, 2: 1.45, 3: 1.2 };

const BLOCK_TAG = /^\s*\{\{\s*(?:[#/](?:if|each)\b[^}]*|else)\s*\}\}\s*$/;

/** The empty document of a new visual template. */
export const EMPTY_DOCUMENT: MailNode = { type: 'doc', content: [{ type: 'paragraph' }] };

/** The document of a visual template's body; an empty one when the body isn't a document. */
export function parseDocument(body: string): MailNode {
	try {
		const value: unknown = JSON.parse(body);

		if (value && typeof value === 'object' && (value as MailNode).type === 'doc') {
			return value as MailNode;
		}
	} catch {
		// Not JSON.
	}

	return EMPTY_DOCUMENT;
}

/** The text of a node and its children. */
export function nodeText(node: MailNode): string {
	return node.text ?? (node.content ?? []).map(nodeText).join('');
}

/** A block tag (`{{#if a}}`, `{{else}}`, `{{/each}}`) alone in a paragraph, list item, … */
function blockTag(node: MailNode): string | null {
	const text = nodeText(node);

	return BLOCK_TAG.test(text) ? text.trim() : null;
}

function alignment(value: unknown, fallback: Alignment = 'left'): Alignment {
	return ALIGNMENTS.includes(value as Alignment) ? (value as Alignment) : fallback;
}

function attribute(value: unknown) {
	return escapeHtml(typeof value === 'string' ? value : '');
}

/** CSS declarations from a map, leaving out empty values. */
function css(declarations: Record<string, string | number | null | undefined | false>) {
	return Object.entries(declarations)
		.filter(([, value]) => value !== null && value !== undefined && value !== false && value !== '')
		.map(([property, value]) => `${property}:${value}`)
		.join(';');
}

/** A `font-size` like `18px` from the editor, checked. */
function fontSize(value: unknown) {
	const match = typeof value === 'string' ? /^(\d{1,2})px$/.exec(value) : null;

	return match ? `${clampNumber(match[1], 8, 72, 16)}px` : null;
}

type Context = { style: MailStyle; inList: boolean };

function renderText(node: MailNode, context: Context) {
	let html = escapeHtml(node.text ?? '');
	const marks = node.marks ?? [];

	for (const mark of marks) {
		switch (mark.type) {
			case 'bold':
				html = `<strong>${html}</strong>`;
				break;
			case 'italic':
				html = `<em>${html}</em>`;
				break;
			case 'underline':
				html = `<u>${html}</u>`;
				break;
			case 'strike':
				html = `<s>${html}</s>`;
				break;
			case 'code':
				html = `<code style="${css({ 'font-family': FONT_STACKS.mono, 'font-size': '0.9em', background: '#f4f4f5', padding: '1px 4px', 'border-radius': '4px' })}">${html}</code>`;
				break;
			case 'textStyle': {
				const style = css({
					color: hexColor(mark.attrs?.color, null),
					'font-size': fontSize(mark.attrs?.fontSize),
					'background-color': hexColor(mark.attrs?.backgroundColor, null)
				});

				if (style) {
					html = `<span style="${style}">${html}</span>`;
				}

				break;
			}
		}
	}

	// The link goes around the other marks, so its color doesn't hide theirs.
	const link = marks.find((mark) => mark.type === 'link');

	if (link) {
		html = `<a href="${attribute(link.attrs?.href)}" target="_blank" style="${css({ color: context.style.linkColor, 'text-decoration': 'underline' })}">${html}</a>`;
	}

	return html;
}

function renderChildren(node: MailNode, context: Context) {
	return (node.content ?? []).map((child) => renderNode(child, context)).join('');
}

function renderNode(node: MailNode, context: Context): string {
	const { style } = context;
	const attrs = node.attrs ?? {};

	switch (node.type) {
		case 'doc':
			return renderChildren(node, context);

		case 'text':
			return renderText(node, context);

		case 'hardBreak':
			return '<br>';

		case 'paragraph': {
			const tag = blockTag(node);

			if (tag !== null) {
				return tag;
			}

			const inner = renderChildren(node, context);

			return `<p style="${css({ margin: context.inList ? '0' : '0 0 16px', 'text-align': attrs.textAlign ? alignment(attrs.textAlign) : null })}">${inner || '&nbsp;'}</p>`;
		}

		case 'heading': {
			const tag = blockTag(node);

			if (tag !== null) {
				return tag;
			}

			const level = clampNumber(attrs.level, 1, 3, 2);
			const size = Math.round(style.fontSize * HEADING_SCALE[level]);

			return `<h${level} style="${css({ margin: '0 0 12px', 'font-size': `${size}px`, 'line-height': 1.3, 'font-weight': 700, 'text-align': attrs.textAlign ? alignment(attrs.textAlign) : null })}">${renderChildren(node, context)}</h${level}>`;
		}

		case 'bulletList':
		case 'orderedList': {
			const tag = node.type === 'bulletList' ? 'ul' : 'ol';

			return `<${tag} style="margin:0 0 16px;padding:0 0 0 24px">${renderChildren(node, { ...context, inList: true })}</${tag}>`;
		}

		case 'listItem': {
			const tag = blockTag(node);

			return tag ?? `<li style="margin:0 0 4px">${renderChildren(node, context)}</li>`;
		}

		case 'blockquote':
			return `<blockquote style="${css({ margin: '0 0 16px', padding: '4px 0 4px 16px', 'border-left': `3px solid ${style.linkColor}`, color: style.textColor, opacity: 0.85 })}">${renderChildren(node, { ...context, inList: false })}</blockquote>`;

		case 'horizontalRule': {
			const thickness = clampNumber(attrs.thickness, 1, 8, BLOCK_DEFAULTS.divider.thickness);
			const color = hexColor(attrs.color, BLOCK_DEFAULTS.divider.color);

			return `<hr style="${css({ margin: '24px 0', border: 0, 'border-top': `${thickness}px solid ${color}` })}">`;
		}

		case 'image': {
			const src = attribute(attrs.src);
			const width = attrs.width === null ? null : clampNumber(attrs.width, 16, 800, 0) || null;
			const radius = clampNumber(attrs.radius, 0, 64, BLOCK_DEFAULTS.image.radius);
			let image = `<img src="${src}" alt="${attribute(attrs.alt)}"${width ? ` width="${width}"` : ''} style="${css({ display: 'inline-block', width: width ? `${width}px` : '100%', 'max-width': '100%', height: 'auto', border: 0, 'border-radius': radius ? `${radius}px` : null })}">`;

			if (typeof attrs.href === 'string' && attrs.href) {
				image = `<a href="${attribute(attrs.href)}" target="_blank">${image}</a>`;
			}

			return `<div style="${css({ margin: '0 0 16px', 'text-align': alignment(attrs.align) })}">${image}</div>`;
		}

		case 'emailButton': {
			const size =
				BUTTON_SIZE_STYLES[
					(attrs.size as ButtonSize) in BUTTON_SIZE_STYLES ? (attrs.size as ButtonSize) : 'medium'
				];
			const fullWidth = attrs.fullWidth === true;
			const radius = clampNumber(attrs.radius, 0, 40, BLOCK_DEFAULTS.button.radius);
			const label = renderChildren(node, context) || 'Button';
			const link = `<a href="${attribute(attrs.href) || '#'}" target="_blank" style="${css({
				display: fullWidth ? 'block' : 'inline-block',
				background: hexColor(attrs.backgroundColor, style.buttonColor),
				color: hexColor(attrs.textColor, style.buttonTextColor),
				'font-family': FONT_STACKS[style.font],
				'font-size': `${size.fontSize}px`,
				'font-weight': 600,
				'line-height': 1.2,
				'text-decoration': 'none',
				'text-align': 'center',
				padding: size.padding,
				'border-radius': `${radius}px`
			})}">${label}</a>`;

			return `<div style="${css({ margin: '8px 0 24px', 'text-align': alignment(attrs.textAlign) })}">${link}</div>`;
		}

		case 'emailSpacer': {
			const height = clampNumber(attrs.height, 4, 160, BLOCK_DEFAULTS.spacer.height);

			return `<div style="${css({ height: `${height}px`, 'line-height': `${height}px`, 'font-size': '1px' })}">&nbsp;</div>`;
		}

		case 'emailSection': {
			const padding = clampNumber(attrs.padding, 0, 64, BLOCK_DEFAULTS.section.padding);
			const radius = clampNumber(attrs.radius, 0, 32, BLOCK_DEFAULTS.section.radius);
			const borderColor = hexColor(attrs.borderColor, null);
			const textColor = hexColor(attrs.textColor, null);

			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:separate"><tr><td style="${css(
				{
					background: hexColor(attrs.backgroundColor, null),
					color: textColor,
					padding: `${padding}px ${padding}px ${Math.max(0, padding - 16)}px`,
					'border-radius': radius ? `${radius}px` : null,
					border: borderColor ? `1px solid ${borderColor}` : null,
					'text-align': attrs.textAlign ? alignment(attrs.textAlign) : null
				}
			)}">${renderChildren(node, { ...context, inList: false })}</td></tr></table>`;
		}

		case 'emailColumns': {
			const columns = (node.content ?? []).filter((child) => child.type === 'emailColumn');
			const gap = clampNumber(attrs.gap, 0, 64, BLOCK_DEFAULTS.columns.gap);
			const widths = columnWidths(columns);

			const cells = columns
				.map((column, index) => {
					const columnAttrs = column.attrs ?? {};
					const padding = clampNumber(columnAttrs.padding, 0, 48, 0);
					const background = hexColor(columnAttrs.backgroundColor, null);
					const inner = renderChildren(column, { ...context, inList: false });
					const content =
						background || padding
							? `<div style="${css({ background, padding: `${padding}px ${padding}px ${Math.max(0, padding - 16)}px`, 'border-radius': background ? '6px' : null })}">${inner}</div>`
							: inner;

					return `<td class="pb-column" width="${widths[index]}%" valign="${VERTICAL_ALIGNMENTS.includes(columnAttrs.verticalAlign as (typeof VERTICAL_ALIGNMENTS)[number]) ? columnAttrs.verticalAlign : 'top'}" style="${css(
						{
							width: `${widths[index]}%`,
							'padding-left': index === 0 ? 0 : `${gap / 2}px`,
							'padding-right': index === columns.length - 1 ? 0 : `${gap / 2}px`
						}
					)}">${content}</td>`;
				})
				.join('');

			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>${cells}</tr></table>`;
		}

		default:
			// Unknown nodes (from a newer editor) keep their content.
			return renderChildren(node, context);
	}
}

/** Widths of columns in percent: set widths are kept, the rest share what is left. */
export function columnWidths(columns: MailNode[]) {
	const set = columns.map((column) => {
		const width = Number(column.attrs?.width);

		return Number.isFinite(width) && width >= 10 && width <= 90 ? Math.round(width) : null;
	});
	const fixed = set.reduce<number>((sum, width) => sum + (width ?? 0), 0);
	const open = set.filter((width) => width === null).length;

	if (fixed > 100 || (open === 0 && fixed !== 100)) {
		return columns.map(() => Math.floor(100 / Math.max(1, columns.length)));
	}

	const share = open ? Math.floor((100 - fixed) / open) : 0;

	return set.map((width) => width ?? share);
}

/** The HTML of a document's content (without the page around it). */
export function renderDocument(document: MailNode, style: MailStyle) {
	return renderNode(document, { style, inList: false });
}
