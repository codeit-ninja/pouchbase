import { describe, expect, it } from 'vitest';

import { htmlToText } from './layout';
import {
	compileTemplate,
	starterSampleData,
	starterTemplate,
	SYSTEM_TEMPLATES
} from './mail-templates';
import { missingVariables, parseTemplate, renderNodes, templateVariables } from './template';

function render(source: string, values: Record<string, unknown>, mode: 'html' | 'text' = 'html') {
	const parsed = parseTemplate(source);

	if (!parsed.ok) {
		throw new Error(parsed.problems.map((problem) => problem.message).join('; '));
	}

	return renderNodes(parsed.nodes, values, mode);
}

describe('renderNodes', () => {
	it('fills in and escapes values', () => {
		expect(
			render('Hi {{ name }}, {{user.role}}', { name: '<b>Ada</b>', user: { role: 'admin' } })
		).toBe('Hi &lt;b&gt;Ada&lt;/b&gt;, admin');
		expect(render('Hi {{name}}', { name: '<b>' }, 'text')).toBe('Hi <b>');
	});

	it('uses the fallback for missing or empty values', () => {
		expect(render('Hi {{name | there}}', {})).toBe('Hi there');
		expect(render('Hi {{name | there}}', { name: '' })).toBe('Hi there');
		expect(render('{{count | none}}', { count: 0 })).toBe('0');
	});

	it('renders if/else', () => {
		const source = '{{#if paid}}Paid{{else}}Due{{/if}}';

		expect(render(source, { paid: true })).toBe('Paid');
		expect(render(source, { paid: false })).toBe('Due');
		expect(render('{{#if items}}some{{else}}none{{/if}}', { items: [] })).toBe('none');
	});

	it('repeats each with the item, the index and the outer scope', () => {
		const source = '{{#each items}}{{@number}}. {{name}} ({{currency}}){{else}}empty{{/each}}';

		expect(render(source, { currency: 'EUR', items: [{ name: 'A' }, { name: 'B' }] })).toBe(
			'1. A (EUR)2. B (EUR)'
		);
		expect(render(source, { items: [] })).toBe('empty');
		expect(render('{{#each tags}}[{{this}}]{{/each}}', { tags: ['x', 'y'] })).toBe('[x][y]');
	});

	it('nests blocks', () => {
		const source = '{{#each orders}}{{#if paid}}{{id}} {{/if}}{{/each}}';

		expect(render(source, { orders: [{ id: 1, paid: true }, { id: 2 }, { id: 3, paid: 1 }] })).toBe(
			'1 3 '
		);
	});
});

describe('parseTemplate', () => {
	it('reports problems with their position', () => {
		const parsed = parseTemplate('Hello\n{{#if a}} {{/each}} {{ bad name }} {{#loop x}}');

		expect(parsed.ok).toBe(false);

		if (!parsed.ok) {
			expect(parsed.problems.map((problem) => problem.message)).toEqual([
				'Expected {{/if}} before {{/each}}',
				'"bad name" is not a variable name',
				'Unknown block "#loop": use #if or #each',
				'{{#if}} is never closed with {{/if}}'
			]);
			expect(parsed.problems[0]).toMatchObject({ line: 2, column: 11 });
		}
	});

	it('rejects a second else and an else outside a block', () => {
		expect(parseTemplate('{{else}}').ok).toBe(false);
		expect(parseTemplate('{{#if a}}{{else}}{{else}}{{/if}}').ok).toBe(false);
	});
});

describe('templateVariables', () => {
	it('finds top-level variables and which are required', () => {
		const parsed = parseTemplate(
			'{{name}} {{greeting | Hi}} {{user.email}} {{#if vip}}{{discount}}{{/if}} {{#each items}}{{title}}{{/each}}'
		);

		expect(parsed.ok).toBe(true);

		if (parsed.ok) {
			const variables = templateVariables(parsed.nodes);

			expect(variables).toEqual([
				{ name: 'name', required: true },
				{ name: 'greeting', required: false },
				{ name: 'user', required: true },
				{ name: 'vip', required: false },
				{ name: 'discount', required: false },
				{ name: 'items', required: true }
			]);
			expect(missingVariables(variables, { name: 'Ada', user: null })).toEqual(['user', 'items']);
		}
	});
});

describe('htmlToText', () => {
	it('turns HTML into text', () => {
		expect(
			htmlToText(
				'<head><title>x</title></head><div data-preheader>hidden</div><h1>Hi &amp; welcome</h1><p>Read <a href="https://a.test">this</a>.</p><ul><li>One</li><li>Two</li></ul>'
			)
		).toBe('Hi & welcome\n\nRead this (https://a.test).\n\n- One\n- Two\n');
	});
});

describe('compileTemplate', () => {
	it('renders every system template with its sample data', () => {
		for (const template of SYSTEM_TEMPLATES) {
			const compiled = compileTemplate(template.content);

			expect(compiled.ok).toBe(true);

			if (compiled.ok) {
				const mail = compiled.render(template.sampleData);

				expect(missingVariables(compiled.variables, template.sampleData)).toEqual([]);
				expect(mail.html).toContain(String(template.sampleData.url));
				expect(mail.text).toContain(String(template.sampleData.url));
			}
		}
	});

	it('renders the starter templates', () => {
		for (const editor of ['visual', 'html'] as const) {
			const compiled = compileTemplate(starterTemplate(editor));

			expect(compiled.ok).toBe(true);

			if (compiled.ok) {
				const mail = compiled.render(starterSampleData(editor));

				expect(mail.subject).toBe('Welcome, Ada');
				expect(mail.html).toContain('Invite your team');
			}
		}
	});
});
