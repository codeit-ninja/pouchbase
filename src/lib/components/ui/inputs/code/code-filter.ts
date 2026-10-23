import type * as MonacoApi from 'monaco-editor';

type Monaco = typeof MonacoApi;

/** A field that a filter can use, for autocomplete. */
export type FilterName = { name: string; type: string };

/** What the autocomplete of a filter offers: the collection's fields and those of `users`. */
export type FilterNames = { fields: FilterName[]; authFields: FilterName[] };

/** A problem to underline in the code, with offsets in the text (`end` exclusive). */
export type Diagnostic = { message: string; start: number; end: number };

/** Monaco id of the filter language of API rules and `?filter=` (see `#lib/filter/filter.ts`). */
export const FILTER_LANGUAGE = 'pouchbase-filter';

let registered = false;

/** Registers the filter language (highlighting, brackets, comments) once. */
export function registerFilterLanguage(monaco: Monaco) {
	if (registered) {
		return;
	}

	monaco.languages.register({ id: FILTER_LANGUAGE });
	monaco.languages.setLanguageConfiguration(FILTER_LANGUAGE, {
		comments: { lineComment: '//' },
		brackets: [['(', ')']],
		autoClosingPairs: [
			{ open: '(', close: ')' },
			{ open: '"', close: '"', notIn: ['string'] },
			{ open: "'", close: "'", notIn: ['string'] }
		],
		wordPattern: /@?[\w.]+/
	});
	monaco.languages.setMonarchTokensProvider(FILTER_LANGUAGE, {
		tokenizer: {
			root: [
				[/\/\/.*$/, 'comment'],
				// Monarch reads `@name` in a pattern as an attribute, so `@` is written as `[@]`.
				[/[@][\w.]*/, 'variable'],
				[/\b(true|false|null)\b/, 'keyword'],
				[/-?\d+(\.\d+)?/, 'number'],
				[/"([^"\\]|\\.)*"?/, 'string'],
				[/'([^'\\]|\\.)*'?/, 'string'],
				[/&&|\|\|/, 'keyword'],
				[/\??(!=|>=|<=|!~|=|>|<|~)/, 'operator'],
				[/[()]/, '@brackets'],
				[/[a-z][\w]*/, 'identifier']
			]
		}
	});
	registered = true;
}

/**
 * Autocomplete for one filter editor: fields after a space or operator, the user's fields after
 * `@request.auth.`, the collection's after `@request.body.`. `names` is read on every request, so
 * it can change while the editor is open.
 */
export function registerFilterCompletions(
	monaco: Monaco,
	model: MonacoApi.editor.ITextModel,
	names: () => FilterNames | undefined
): MonacoApi.IDisposable {
	const { CompletionItemKind } = monaco.languages;

	return monaco.languages.registerCompletionItemProvider(FILTER_LANGUAGE, {
		triggerCharacters: ['@', '.'],
		provideCompletionItems(target, position) {
			if (target !== model) {
				return { suggestions: [] };
			}

			const line = target.getLineContent(position.lineNumber).slice(0, position.column - 1);
			const prefix = /[@\w.]*$/.exec(line)?.[0] ?? '';
			const range = {
				startLineNumber: position.lineNumber,
				startColumn: position.column - prefix.length,
				endLineNumber: position.lineNumber,
				endColumn: position.column
			};
			const { fields = [], authFields = [] } = names() ?? {};
			// Typing `@request.` again suggests what follows, like in a code editor.
			const retrigger = { id: 'editor.action.triggerSuggest', title: 'Suggest' };
			const field = (name: FilterName, insert: string, detail: string) => ({
				label: insert,
				kind: CompletionItemKind.Field,
				detail: `${name.type} · ${detail}`,
				insertText: insert,
				range
			});

			if (prefix.startsWith('@request.auth.')) {
				return {
					// Asked again as you type, so `@request.auth.` lists the user's fields.
					incomplete: true,
					suggestions: authFields.map((name) =>
						field(name, `@request.auth.${name.name}`, 'the signed-in user')
					)
				};
			}

			if (prefix.startsWith('@request.body.')) {
				return {
					// Asked again as you type, so `@request.auth.` lists the user's fields.
					incomplete: true,
					suggestions: fields.map((name) =>
						field(name, `@request.body.${name.name}`, 'the submitted value')
					)
				};
			}

			const variables = [
				{
					label: '@request.auth.',
					detail: 'A field of the signed-in user; "" when signed out',
					command: retrigger
				},
				{
					label: '@request.body.',
					detail: 'A submitted value, for create and update rules',
					command: retrigger
				},
				{ label: '@now', detail: 'The current date and time' }
			].map((variable) => ({
				...variable,
				kind: CompletionItemKind.Variable,
				insertText: variable.label,
				range
			}));

			if (prefix.startsWith('@')) {
				return { incomplete: true, suggestions: variables };
			}

			return {
				incomplete: true,
				suggestions: [
					...fields.map((name) => field(name, name.name, 'field of this collection')),
					...variables,
					...['true', 'false', 'null'].map((label) => ({
						label,
						kind: CompletionItemKind.Keyword,
						insertText: label,
						range
					}))
				]
			};
		}
	});
}

/** Underlines `diagnostics` in the model; an empty list clears them. */
export function setDiagnostics(
	monaco: Monaco,
	model: MonacoApi.editor.ITextModel,
	diagnostics: Diagnostic[]
) {
	monaco.editor.setModelMarkers(
		model,
		'pouchbase',
		diagnostics.map((diagnostic) => {
			const start = model.getPositionAt(diagnostic.start);
			const end = model.getPositionAt(Math.max(diagnostic.end, diagnostic.start + 1));

			return {
				severity: monaco.MarkerSeverity.Error,
				message: diagnostic.message,
				startLineNumber: start.lineNumber,
				startColumn: start.column,
				endLineNumber: end.lineNumber,
				endColumn: end.column
			};
		})
	);
}
