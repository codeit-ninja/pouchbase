import { describe, expect, it } from 'vitest';

import type { MailNode } from './document';

import { columnWidths, parseDocument, renderDocument } from './document';
import { DEFAULT_MAIL_STYLE, normalizeStyle, visualLayout } from './layout';
import { parseTemplate, renderNodes } from './template';

const style = DEFAULT_MAIL_STYLE;

const text = (value: string, marks?: MailNode['marks']): MailNode => ({
	type: 'text',
	text: value,
	...(marks ? { marks } : {})
});

const paragraph = (...content: MailNode[]): MailNode => ({ type: 'paragraph', content });

function render(...content: MailNode[]) {
	return renderDocument({ type: 'doc', content }, style);
}

describe('renderDocument', () => {
	it('escapes text and keeps variable tags', () => {
		expect(render(paragraph(text('<b>{{ name | a & b }}</b>')))).toBe(
			'<p style="margin:0 0 16px">&lt;b&gt;{{ name | a &amp; b }}&lt;/b&gt;</p>'
		);
	});

	it('writes marks, with the link around the others', () => {
		const html = render(
			paragraph(
				text('Hi', [
					{ type: 'bold' },
					{ type: 'textStyle', attrs: { color: '#ff0000', fontSize: '18px' } },
					{ type: 'link', attrs: { href: '{{url}}' } }
				])
			)
		);

		expect(html).toBe(
			'<p style="margin:0 0 16px"><a href="{{url}}" target="_blank" style="color:#2563eb;text-decoration:underline"><span style="color:#ff0000;font-size:18px"><strong>Hi</strong></span></a></p>'
		);
	});

	it('ignores invalid style values', () => {
		const html = render(
			paragraph(text('Hi', [{ type: 'textStyle', attrs: { color: 'red;x:y', fontSize: '1e9px' } }]))
		);

		expect(html).toBe('<p style="margin:0 0 16px">Hi</p>');
	});

	it('leaves out paragraphs and list items around block tags', () => {
		const html = render(
			paragraph(text('{{#if a}}')),
			{
				type: 'bulletList',
				content: [
					{ type: 'listItem', content: [paragraph(text('{{#each xs}}'))] },
					{ type: 'listItem', content: [paragraph(text('{{this}}'))] },
					{ type: 'listItem', content: [paragraph(text('{{/each}}'))] }
				]
			},
			paragraph(text('{{/if}}'))
		);

		expect(html).toBe(
			'{{#if a}}<ul style="margin:0 0 16px;padding:0 0 0 24px">{{#each xs}}<li style="margin:0 0 4px"><p style="margin:0">{{this}}</p></li>{{/each}}</ul>{{/if}}'
		);
	});

	it('renders buttons with their size, colors and alignment', () => {
		const html = render({
			type: 'emailButton',
			attrs: {
				href: '{{url}}',
				size: 'large',
				backgroundColor: '#E11D48',
				textColor: 'nope',
				radius: 99,
				fullWidth: true,
				textAlign: 'center'
			},
			content: [text('Go')]
		});

		expect(html).toContain('text-align:center');
		expect(html).toContain('href="{{url}}"');
		expect(html).toContain('display:block');
		expect(html).toContain('background:#e11d48');
		expect(html).toContain(`color:${style.buttonTextColor}`);
		expect(html).toContain('font-size:17px');
		expect(html).toContain('padding:16px 30px');
		expect(html).toContain('border-radius:40px');
	});

	it('renders sections and columns as tables', () => {
		const html = render({
			type: 'emailSection',
			attrs: { backgroundColor: '#f4f4f5', padding: 16 },
			content: [
				{
					type: 'emailColumns',
					attrs: { gap: 20 },
					content: [
						{ type: 'emailColumn', attrs: { width: 40 }, content: [paragraph(text('A'))] },
						{ type: 'emailColumn', content: [paragraph(text('B'))] }
					]
				}
			]
		});

		expect(html).toContain('background:#f4f4f5');
		expect(html).toContain(
			'<td class="pb-column" width="40%" valign="top" style="width:40%;padding-left:0;padding-right:10px">'
		);
		expect(html).toContain(
			'<td class="pb-column" width="60%" valign="top" style="width:60%;padding-left:10px;padding-right:0">'
		);
	});

	it('renders images, spacers and dividers', () => {
		const html = render(
			{
				type: 'image',
				attrs: {
					src: '{{logo}}',
					alt: 'Logo "x"',
					width: 120,
					align: 'center',
					href: 'https://a.test'
				}
			},
			{ type: 'emailSpacer', attrs: { height: 40 } },
			{ type: 'horizontalRule', attrs: { thickness: 2, color: '#000000' } }
		);

		expect(html).toContain(
			'<div style="margin:0 0 16px;text-align:center"><a href="https://a.test" target="_blank"><img src="{{logo}}" alt="Logo &quot;x&quot;" width="120"'
		);
		expect(html).toContain('height:40px');
		expect(html).toContain('border-top:2px solid #000000');
	});

	it('uses the space above and below a block, clamped, and the defaults otherwise', () => {
		expect(
			render(
				{
					type: 'heading',
					attrs: { level: 1, marginTop: 32, marginBottom: 0 },
					content: [text('Hi')]
				},
				{ type: 'paragraph', attrs: { marginTop: null, marginBottom: 500 }, content: [text('A')] },
				{ type: 'horizontalRule', attrs: { marginTop: 8, marginBottom: 'x' } }
			)
		).toBe(
			'<h1 style="margin:32px 0 0;font-size:28px;line-height:1.3;font-weight:700">Hi</h1>' +
				'<p style="margin:0 0 96px">A</p>' +
				'<hr style="margin:8px 0 24px;border:0;border-top:1px solid #e4e4e7">'
		);
	});

	it('lets a paragraph in a list keep its own spacing', () => {
		const list = (attrs?: MailNode['attrs']): MailNode => ({
			type: 'bulletList',
			content: [{ type: 'listItem', content: [{ type: 'paragraph', attrs, content: [text('A')] }] }]
		});

		expect(render(list())).toContain('<p style="margin:0">A</p>');
		expect(render(list({ marginBottom: 8 }))).toContain('<p style="margin:0 0 8px">A</p>');
	});
});

describe('columnWidths', () => {
	const column = (width?: number): MailNode => ({ type: 'emailColumn', attrs: { width } });

	it('shares what is left between the open columns', () => {
		expect(columnWidths([column(), column(), column()])).toEqual([33, 33, 33]);
		expect(columnWidths([column(50), column(), column()])).toEqual([50, 25, 25]);
	});

	it("falls back to equal widths when the set widths don't add up", () => {
		expect(columnWidths([column(70), column(60)])).toEqual([50, 50]);
		expect(columnWidths([column(30), column(30)])).toEqual([50, 50]);
	});
});

describe('visualLayout', () => {
	it('lays out the document with the style and a hidden preheader', () => {
		const html = visualLayout(
			parseDocument(JSON.stringify({ type: 'doc', content: [paragraph(text('Hi'))] })),
			{ contentColor: '#fafafa', width: 2000, backgroundColor: 'red;} body{' },
			'Read {{this}}'
		);

		expect(html).toContain('background:#fafafa');
		expect(html).toContain('width:800px');
		expect(html).not.toContain('body{');
		expect(html).toContain('<div data-preheader');
		expect(parseTemplate(html).ok).toBe(true);
	});

	it("renders an empty document for a body that isn't one", () => {
		expect(parseDocument('<p>old</p>')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
	});

	it('fills in variables after the layout', () => {
		const parsed = parseTemplate(
			visualLayout({ type: 'doc', content: [paragraph(text('Hi {{name}}'))] }, normalizeStyle(null))
		);

		expect(parsed.ok && renderNodes(parsed.nodes, { name: '<Ada>' }, 'html')).toContain(
			'Hi &lt;Ada&gt;'
		);
	});
});
