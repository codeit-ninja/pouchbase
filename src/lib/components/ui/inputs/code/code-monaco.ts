import type { Completion } from './code-root.svelte';
import type * as MonacoApi from 'monaco-editor';

type Monaco = typeof MonacoApi;

/**
 * Loads Monaco (the editor of VS Code) on demand, in the browser only: it is large, so it is a
 * separate chunk that is fetched the first time a code editor is shown.
 */

let loading: Promise<Monaco> | undefined;

export function loadMonaco() {
	loading ??= (async () => {
		const [
			monaco,
			{ default: EditorWorker },
			{ default: TypeScriptWorker },
			{ default: JsonWorker }
		] = await Promise.all([
			import('monaco-editor'),
			import('monaco-editor/editor/editor.worker?worker'),
			import('monaco-editor/languages/features/typescript/ts.worker?worker'),
			import('monaco-editor/languages/features/json/json.worker?worker')
		]);

		// Language services run in web workers; JavaScript uses the TypeScript one.
		self.MonacoEnvironment = {
			getWorker(_id, label) {
				if (label === 'typescript' || label === 'javascript') {
					return new TypeScriptWorker();
				}

				return label === 'json' ? new JsonWorker() : new EditorWorker();
			}
		};

		return monaco;
	})();

	return loading;
}

/**
 * Adds autocomplete and hovers for `completions` to one editor's model. Providers are registered
 * per language, so they only answer for this model. Returns what to dispose with the editor.
 */
export function registerCompletions(
	monaco: Monaco,
	language: string,
	model: MonacoApi.editor.ITextModel,
	completions: Completion[]
): MonacoApi.IDisposable[] {
	const kinds = {
		function: monaco.languages.CompletionItemKind.Function,
		keyword: monaco.languages.CompletionItemKind.Keyword,
		value: monaco.languages.CompletionItemKind.Value
	};
	const byName = new Map(
		completions
			.filter((completion) => !completion.inString)
			.map((completion) => [completion.label.toLowerCase(), completion])
	);

	return [
		monaco.languages.registerCompletionItemProvider(language, {
			triggerCharacters: ["'"],
			provideCompletionItems(target, position) {
				if (target !== model) {
					return { suggestions: [] };
				}

				const before = target.getValueInRange({
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: position.lineNumber,
					endColumn: position.column
				});
				// An odd number of quotes before the cursor: it is inside a string literal.
				const inString = (before.match(/'/g)?.length ?? 0) % 2 === 1;
				const word = target.getWordUntilPosition(position);
				// Inside a string, the whole text after the opening quote is replaced (it has spaces).
				const start = inString ? target.getPositionAt(before.lastIndexOf("'") + 1) : null;
				const range = {
					startLineNumber: start?.lineNumber ?? position.lineNumber,
					startColumn: start?.column ?? word.startColumn,
					endLineNumber: position.lineNumber,
					endColumn: position.column
				};

				return {
					suggestions: completions
						.filter((completion) => !!completion.inString === inString)
						.map((completion) => ({
							label: completion.label,
							kind: kinds[completion.kind],
							detail: completion.detail,
							documentation: completion.documentation
								? { value: completion.documentation }
								: undefined,
							insertText: completion.insertText ?? completion.label,
							insertTextRules: completion.insertText
								? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
								: undefined,
							range
						}))
				};
			}
		}),
		monaco.languages.registerHoverProvider(language, {
			provideHover(target, position) {
				const word = target === model ? target.getWordAtPosition(position) : null;
				const completion = word && byName.get(word.word.toLowerCase());

				if (!word || !completion) {
					return null;
				}

				return {
					range: {
						startLineNumber: position.lineNumber,
						startColumn: word.startColumn,
						endLineNumber: position.lineNumber,
						endColumn: word.endColumn
					},
					contents: [
						{ value: `\`\`\`${language}\n${completion.detail ?? completion.label}\n\`\`\`` },
						...(completion.documentation ? [{ value: completion.documentation }] : [])
					]
				};
			}
		})
	];
}

let compiles = 0;

/**
 * Compiles TypeScript to JavaScript (an ES module) with the editor's TypeScript service, in the
 * browser. Types are only removed, not checked: the editor shows type errors as you type.
 */
export async function compileTypeScript(source: string) {
	const monaco = await loadMonaco();
	const defaults = monaco.typescript.typescriptDefaults;

	defaults.setCompilerOptions({
		...defaults.getCompilerOptions(),
		target: monaco.typescript.ScriptTarget.ES2020,
		module: monaco.typescript.ModuleKind.ESNext
	});

	const uri = monaco.Uri.parse(`file:///compile-${++compiles}.ts`);
	const model = monaco.editor.createModel(source, 'typescript', uri);

	try {
		const worker = await monaco.typescript.getTypeScriptWorker();
		const client = await worker(uri);
		const output = await client.getEmitOutput(uri.toString());
		const file = output.outputFiles.find((candidate) => candidate.name.endsWith('.js'));

		if (!file) {
			throw new Error('The TypeScript compiler returned no JavaScript');
		}

		return file.text;
	} finally {
		model.dispose();
	}
}
