/**
 * The variable syntax of email templates, shared by the editor (preview, problems) and the server
 * (sending). A small Mustache-like language:
 *
 * - `{{ name }}`, `{{ user.name }}`: a value, HTML-escaped in the HTML version.
 * - `{{ name | there }}`: with a fallback when the value is missing or empty.
 * - `{{#if paid}} … {{else}} … {{/if}}`: shown when the value is truthy (a non-empty array counts).
 * - `{{#each items}} … {{else}} … {{/each}}`: repeated per item; inside, `{{ this }}`, `{{ name }}`
 *   (a field of the item, or else of the outer scope), `{{ @index }}` (0-based) and `{{ @number }}`
 *   (1-based) are available.
 */

export type TemplateNode =
	| { type: 'text'; value: string }
	| { type: 'variable'; path: string; fallback: string | null }
	| { type: 'if'; path: string; then: TemplateNode[]; else: TemplateNode[] }
	| { type: 'each'; path: string; body: TemplateNode[]; else: TemplateNode[] };

export type TemplateProblem = {
	message: string;
	/** 1-based line and column of the tag. */
	line: number;
	column: number;
	/** Offsets of the tag in the source. */
	start: number;
	end: number;
};

export type ParsedTemplate =
	{ ok: true; nodes: TemplateNode[] } | { ok: false; problems: TemplateProblem[] };

/** A variable a template uses outside loops; `required` when its value can't be left out. */
export type TemplateVariable = { name: string; required: boolean };

export type Variables = Record<string, unknown>;

const TAG = /\{\{\s*([\s\S]*?)\s*\}\}/g;
const PATH = /^(?:this|@index|@number|(?:this\.)?[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*)$/;

type Frame = {
	type: 'root' | 'if' | 'each';
	path: string;
	then: TemplateNode[];
	else: TemplateNode[] | null;
	tag: { start: number; end: number };
};

function position(source: string, start: number, end: number) {
	const before = source.slice(0, start);
	const line = before.split('\n').length;

	return { line, column: start - before.lastIndexOf('\n'), start, end };
}

function current(frame: Frame) {
	return frame.else ?? frame.then;
}

/** Parses a template; problems are reported with their position, all at once. */
export function parseTemplate(source: string): ParsedTemplate {
	const problems: TemplateProblem[] = [];
	const root: Frame = { type: 'root', path: '', then: [], else: null, tag: { start: 0, end: 0 } };
	const stack: Frame[] = [root];
	let last = 0;

	const problem = (message: string, start: number, end: number) => {
		problems.push({ message, ...position(source, start, end) });
	};

	for (const match of source.matchAll(TAG)) {
		const start = match.index;
		const end = start + match[0].length;
		const content = match[1];
		const frame = stack[stack.length - 1];

		if (start > last) {
			current(frame).push({ type: 'text', value: source.slice(last, start) });
		}

		last = end;

		const block = /^([#/])\s*(\w+)\s*(.*)$/s.exec(content);

		if (block) {
			const [, sigil, keyword, argument] = block;

			if (keyword !== 'if' && keyword !== 'each') {
				problem(`Unknown block "${sigil}${keyword}": use #if or #each`, start, end);
				continue;
			}

			if (sigil === '#') {
				if (!PATH.test(argument)) {
					problem(`"{{#${keyword}}}" needs a variable, like {{#${keyword} items}}`, start, end);
				}

				stack.push({ type: keyword, path: argument, then: [], else: null, tag: { start, end } });
				continue;
			}

			if (argument) {
				problem(`"{{/${keyword}}}" takes no variable`, start, end);
			}

			if (frame.type !== keyword) {
				problem(
					frame.type === 'root'
						? `"{{/${keyword}}}" has no matching {{#${keyword}}}`
						: `Expected {{/${frame.type}}} before {{/${keyword}}}`,
					start,
					end
				);
				continue;
			}

			stack.pop();
			const parent = stack[stack.length - 1];

			current(parent).push(
				frame.type === 'if'
					? { type: 'if', path: frame.path, then: frame.then, else: frame.else ?? [] }
					: { type: 'each', path: frame.path, body: frame.then, else: frame.else ?? [] }
			);
			continue;
		}

		if (content === 'else') {
			if (frame.type === 'root') {
				problem('"{{else}}" is only allowed inside {{#if}} or {{#each}}', start, end);
			} else if (frame.else) {
				problem(`A {{#${frame.type}}} block has one {{else}} at most`, start, end);
			} else {
				frame.else = [];
			}

			continue;
		}

		const separator = content.indexOf('|');
		const path = (separator === -1 ? content : content.slice(0, separator)).trim();
		const fallback = separator === -1 ? null : content.slice(separator + 1).trim();

		if (!path) {
			problem('Empty tag: write a variable name, like {{name}}', start, end);
			continue;
		}

		if (!PATH.test(path)) {
			problem(`"${path}" is not a variable name`, start, end);
			continue;
		}

		current(frame).push({ type: 'variable', path, fallback });
	}

	if (last < source.length) {
		current(stack[stack.length - 1]).push({ type: 'text', value: source.slice(last) });
	}

	for (const frame of stack.slice(1)) {
		problem(
			`{{#${frame.type}}} is never closed with {{/${frame.type}}}`,
			frame.tag.start,
			frame.tag.end
		);
	}

	return problems.length ? { ok: false, problems } : { ok: true, nodes: root.then };
}

/** Problems of several sources at once (e.g. the subject and the body), each with its own name. */
export function templateProblems(sources: Record<string, string>) {
	return Object.entries(sources).flatMap(([name, source]) => {
		const parsed = parseTemplate(source);

		return parsed.ok ? [] : parsed.problems.map((item) => ({ ...item, source: name }));
	});
}

/** The top-level variables the nodes use, in order of appearance. */
export function templateVariables(...lists: TemplateNode[][]): TemplateVariable[] {
	const found = new Map<string, boolean>();

	const add = (path: string, required: boolean) => {
		if (path === 'this' || path.startsWith('@') || path.startsWith('this.')) {
			return;
		}

		const name = path.split('.')[0];
		found.set(name, (found.get(name) ?? false) || required);
	};

	const walk = (nodes: TemplateNode[], conditional: boolean) => {
		for (const node of nodes) {
			if (node.type === 'variable') {
				add(node.path, !conditional && node.fallback === null);
			} else if (node.type === 'if') {
				add(node.path, false);
				walk(node.then, true);
				walk(node.else, true);
			} else if (node.type === 'each') {
				add(node.path, !conditional);
				// Names inside a loop are fields of the item first, so they don't count here.
				walk(node.else, true);
			}
		}
	};

	for (const nodes of lists) {
		walk(nodes, false);
	}

	return [...found].map(([name, required]) => ({ name, required }));
}

/** Required variables that are missing (`undefined` or `null`) in the values. */
export function missingVariables(variables: TemplateVariable[], values: Variables) {
	return variables
		.filter((variable) => variable.required && (values[variable.name] ?? null) === null)
		.map((variable) => variable.name);
}

export function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

type Scope = { value: unknown; index?: number };

function lookup(path: string, scopes: Scope[]): unknown {
	const inner = scopes[scopes.length - 1];

	if (path === 'this') {
		return inner.value;
	}

	if (path === '@index') {
		return inner.index;
	}

	if (path === '@number') {
		return inner.index === undefined ? undefined : inner.index + 1;
	}

	const own = path.startsWith('this.');
	const keys = (own ? path.slice(5) : path).split('.');

	for (const scope of own ? [inner] : [...scopes].reverse()) {
		const value = scope.value;

		if (value && typeof value === 'object' && keys[0] in value) {
			return keys.reduce<unknown>(
				(object, key) =>
					object && typeof object === 'object'
						? (object as Record<string, unknown>)[key]
						: undefined,
				value
			);
		}
	}

	return undefined;
}

function truthy(value: unknown) {
	return Array.isArray(value) ? value.length > 0 : !!value;
}

function display(value: unknown) {
	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
		return String(value);
	}

	return '';
}

/**
 * Renders parsed nodes. In `html` mode values are escaped and fallbacks are taken as they are
 * written (they are part of the HTML); in `text` mode nothing is escaped.
 */
export function renderNodes(nodes: TemplateNode[], values: Variables, mode: 'html' | 'text') {
	const render = (list: TemplateNode[], scopes: Scope[]): string =>
		list
			.map((node) => {
				switch (node.type) {
					case 'text':
						return node.value;
					case 'variable': {
						const value = display(lookup(node.path, scopes));

						if (value === '') {
							return node.fallback ?? '';
						}

						return mode === 'html' ? escapeHtml(value) : value;
					}
					case 'if':
						return render(truthy(lookup(node.path, scopes)) ? node.then : node.else, scopes);
					case 'each': {
						const items = lookup(node.path, scopes);

						if (!Array.isArray(items) || !items.length) {
							return render(node.else, scopes);
						}

						return items
							.map((item, index) => render(node.body, [...scopes, { value: item, index }]))
							.join('');
					}
				}
			})
			.join('');

	return render(nodes, [{ value: values }]);
}
