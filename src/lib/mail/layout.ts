/**
 * The look of templates made in the visual editor: the email's style (colors, font, logo, card)
 * and the page around the content. The content itself is rendered from the editor's document by
 * `./document.ts`. Shared by the editor, the preview and the server, so all show the same email.
 */

import type { MailNode } from './document';

import { renderDocument } from './document';
import { escapeHtml } from './template';

export const MAIL_FONTS = ['sans', 'serif', 'mono'] as const;

export type MailFont = (typeof MAIL_FONTS)[number];

export const LOGO_ALIGNMENTS = ['left', 'center'] as const;

export type MailStyle = {
	/** Around the card. */
	backgroundColor: string;
	/** Of the card. */
	contentColor: string;
	textColor: string;
	/** Of links. */
	linkColor: string;
	/** Of buttons that don't have colors of their own. */
	buttonColor: string;
	buttonTextColor: string;
	font: MailFont;
	/** Of paragraphs, in pixels; headings scale with it. */
	fontSize: number;
	/** Shown above the content; may use variables. Empty for none. */
	logoUrl: string;
	/** Height of the logo in pixels. */
	logoHeight: number;
	logoAlign: (typeof LOGO_ALIGNMENTS)[number];
	/** Width of the card in pixels. */
	width: number;
	/** Space inside the card, in pixels. */
	padding: number;
	/** Rounding of the card's corners, in pixels. */
	radius: number;
};

export const DEFAULT_MAIL_STYLE: MailStyle = {
	backgroundColor: '#f4f4f5',
	contentColor: '#ffffff',
	textColor: '#18181b',
	linkColor: '#2563eb',
	buttonColor: '#18181b',
	buttonTextColor: '#ffffff',
	font: 'sans',
	fontSize: 15,
	logoUrl: '',
	logoHeight: 40,
	logoAlign: 'left',
	width: 600,
	padding: 32,
	radius: 8
};

export const FONT_STACKS: Record<MailFont, string> = {
	sans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
	serif: "Georgia,'Times New Roman',Times,serif",
	mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace"
};

const COLOR = /^#[0-9a-f]{6}$/i;

/** A color like `#18181b`, or the fallback. */
export function hexColor<T extends string | null>(value: unknown, fallback: T): string | T {
	return typeof value === 'string' && COLOR.test(value) ? value.toLowerCase() : fallback;
}

/** A whole number within bounds, or the fallback. */
export function clampNumber(value: unknown, min: number, max: number, fallback: number) {
	const number = Number(value);

	return value !== null && value !== '' && Number.isFinite(number)
		? Math.min(max, Math.max(min, Math.round(number)))
		: fallback;
}

/** The style with every value checked, so a stored style can't break out of an attribute. */
export function normalizeStyle(style: Partial<MailStyle> | null | undefined): MailStyle {
	const value = style ?? {};
	const defaults = DEFAULT_MAIL_STYLE;

	return {
		backgroundColor: hexColor(value.backgroundColor, defaults.backgroundColor),
		contentColor: hexColor(value.contentColor, defaults.contentColor),
		textColor: hexColor(value.textColor, defaults.textColor),
		linkColor: hexColor(value.linkColor, defaults.linkColor),
		buttonColor: hexColor(value.buttonColor, defaults.buttonColor),
		buttonTextColor: hexColor(value.buttonTextColor, defaults.buttonTextColor),
		font: MAIL_FONTS.includes(value.font as MailFont) ? (value.font as MailFont) : defaults.font,
		fontSize: clampNumber(value.fontSize, 12, 20, defaults.fontSize),
		logoUrl: typeof value.logoUrl === 'string' ? value.logoUrl.trim() : '',
		logoHeight: clampNumber(value.logoHeight, 16, 120, defaults.logoHeight),
		logoAlign: value.logoAlign === 'center' ? 'center' : 'left',
		width: clampNumber(value.width, 320, 800, defaults.width),
		padding: clampNumber(value.padding, 0, 64, defaults.padding),
		radius: clampNumber(value.radius, 0, 32, defaults.radius)
	};
}

/** Columns stack on narrow screens; the only CSS that can't be written inline. */
const RESPONSIVE_CSS = `@media only screen and (max-width:620px){.pb-card{width:100%!important}.pb-column{display:block!important;width:100%!important;padding:0 0 16px!important}}`;

/** The full email of a visual template, still with its variable tags. */
export function visualLayout(
	document: MailNode,
	input: Partial<MailStyle> | null | undefined,
	preheader = ''
) {
	const style = normalizeStyle(input);
	const content = renderDocument(document, style);
	const logo = style.logoUrl
		? `<div style="text-align:${style.logoAlign};margin:0 0 24px"><img src="${escapeHtml(style.logoUrl)}" alt="" height="${style.logoHeight}" style="display:inline-block;height:${style.logoHeight}px;width:auto;border:0"></div>`
		: '';
	// Shown by mail clients next to the subject, hidden in the email itself.
	const hidden = preheader.trim()
		? `<div data-preheader style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(preheader.trim())}</div>`
		: '';

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<style>${RESPONSIVE_CSS}</style>
</head>
<body style="margin:0;padding:0;background:${style.backgroundColor}">
${hidden}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${style.backgroundColor}">
<tr><td align="center" style="padding:32px 12px">
<table role="presentation" class="pb-card" width="${style.width}" cellpadding="0" cellspacing="0" border="0" style="width:${style.width}px;max-width:100%;background:${style.contentColor};border-radius:${style.radius}px">
<tr><td style="padding:${style.padding}px;font-family:${FONT_STACKS[style.font]};color:${style.textColor};font-size:${style.fontSize}px;line-height:1.6">
${logo}${content}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

function decodeEntities(value: string) {
	return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, code: string) => {
		if (code.startsWith('#x') || code.startsWith('#X')) {
			return String.fromCodePoint(parseInt(code.slice(2), 16));
		}

		if (code.startsWith('#')) {
			return String.fromCodePoint(Number(code.slice(1)));
		}

		return ENTITIES[code.toLowerCase()] ?? entity;
	});
}

/** The plain-text version of an email, for clients that don't show HTML. */
export function htmlToText(html: string) {
	const text = html
		.replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, '')
		.replace(/<div data-preheader[^>]*>[\s\S]*?<\/div>/gi, '')
		.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
			const content = label.replace(/<[^>]+>/g, '').trim();
			const url = decodeEntities(href);

			return !content || content === url || href.startsWith('#') ? url : `${content} (${url})`;
		})
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<li[^>]*>/gi, '\n- ')
		.replace(/<hr[^>]*>/gi, '\n---\n')
		.replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|pre|tr|td|table)>/gi, '\n\n')
		.replace(/<[^>]+>/g, '');

	return (
		decodeEntities(text)
			.split('\n')
			.map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
			.join('\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim() + '\n'
	);
}
