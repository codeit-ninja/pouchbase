<script module lang="ts">
	import type { Diagnostic, FilterNames } from './code-filter';

	/** `filter`: the filter syntax of API rules and `?filter=` (`#lib/filter/filter.ts`). */
	export type Language = 'javascript' | 'typescript' | 'json' | 'sql' | 'filter';

	/** A suggestion of the editor's autocomplete, also shown when hovering it in the code. */
	export type Completion = {
		label: string;
		kind: 'function' | 'keyword' | 'value';
		/** Shown next to the label, e.g. the signature of a function. */
		detail?: string;
		/** Markdown. */
		documentation?: string;
		/** What is inserted, in snippet syntax (`$1`, `${1:default}`, `$0`); defaults to the label. */
		insertText?: string;
		/** Only suggested inside a string literal (`'…'`), e.g. the modifiers of a date function. */
		inString?: boolean;
	};

	export type Props = {
		value?: string;
		language?: Language;
		/**
		 * TypeScript declarations available to the code (JavaScript and TypeScript), for
		 * autocomplete, hovers and type errors, e.g. `declare const record: { title: string };`.
		 */
		typings?: string;
		/**
		 * Suggestions for languages without a language service of their own (such as SQL), with
		 * hovers for functions and keywords.
		 */
		completions?: Completion[];
		/** For `filter`: the fields autocomplete offers, after a space and after `@request.*`. */
		filterNames?: FilterNames;
		/**
		 * Problems to underline, checked after every edit, e.g. from a parser; for languages
		 * without a language service of their own.
		 */
		diagnostics?: (value: string) => Diagnostic[];
		/** Show line numbers; turn off for short code such as a single expression. */
		lineNumbers?: boolean;
		/** Shown while the editor is empty. */
		placeholder?: string;
		/** Allow `return` outside a function, for code that runs as the body of a function. */
		allowReturn?: boolean;
		/** Standard library the code can use; leaves out the DOM by default. */
		lib?: string[];
		readonly?: boolean;
		/** Called after every edit made in the editor. */
		onValueChange?: (value: string) => void;
		id?: string;
		/** Size the editor with a height class; it fills the width. */
		class?: string;
		'aria-invalid'?: boolean | 'true' | 'false';
		'aria-describedby'?: string;
		'aria-labelledby'?: string;
		/** For an editor without a visible label. */
		'aria-label'?: string;
	};
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type * as Monaco from 'monaco-editor';
	import { untrack } from 'svelte';
	import * as Spinner from '../../spinner';
	import {
		FILTER_LANGUAGE,
		registerFilterCompletions,
		registerFilterLanguage,
		setDiagnostics
	} from './code-filter';
	import { loadMonaco, registerCompletions } from './code-monaco';

	let {
		value = $bindable(''),
		language = 'javascript',
		typings,
		completions,
		filterNames,
		diagnostics,
		lineNumbers = true,
		placeholder,
		allowReturn = false,
		lib = ['es2022'],
		readonly = false,
		onValueChange,
		id: idProp,
		class: className,
		...aria
	}: Props = $props();

	const fallbackId = $props.id();
	const id = $derived(idProp ?? fallbackId);

	let editor = $state.raw<Monaco.editor.IStandaloneCodeEditor | null>(null);
	let failed = $state(false);
	// Set once the editor is created, so the diagnostics can be refreshed from an effect.
	let monacoApi = $state.raw<typeof Monaco | null>(null);

	const mount: Attachment<HTMLDivElement> = (node) => {
		let disposed = false;
		const disposables: Monaco.IDisposable[] = [];

		// Only the settings below are read here; content changes go through the effect further down.
		const settings = untrack(() => ({
			language,
			typings,
			completions,
			lineNumbers,
			placeholder,
			allowReturn,
			lib,
			readonly,
			initial: value,
			key: id.replace(/[^\w-]/g, '')
		}));

		// Suggestions, hovers and parameter hints are rendered here, directly under `body`, so they
		// can extend past a surrounding dialog (whose `translate` and `contain` would otherwise
		// position and clip them). `monaco-editor` makes Monaco's styles apply.
		const widgets = document.createElement('div');
		widgets.className = 'monaco-editor';
		// Above dialogs (z-50). A modal dialog turns off pointer events on `body` (only its own
		// overlay and content opt back in), so this layer opts back in too.
		widgets.style.cssText = 'position: relative; z-index: 60; pointer-events: auto;';
		// Monaco has handled the pointer by the time it bubbles up to here. Stopping it keeps a
		// surrounding dialog from treating a click on a suggestion as a click outside and closing.
		widgets.addEventListener('pointerdown', (event) => event.stopPropagation());
		document.body.appendChild(widgets);

		loadMonaco()
			.then((monaco) => {
				if (disposed) {
					return;
				}

				if (settings.language === 'javascript' || settings.language === 'typescript') {
					const defaults =
						settings.language === 'javascript'
							? monaco.typescript.javascriptDefaults
							: monaco.typescript.typescriptDefaults;

					defaults.setCompilerOptions({
						target: monaco.typescript.ScriptTarget.ES2020,
						lib: settings.lib,
						allowJs: true,
						checkJs: true,
						allowNonTsExtensions: true
					});
					defaults.setDiagnosticsOptions({
						noSemanticValidation: false,
						noSyntaxValidation: false,
						// 1108: "A 'return' statement can only be used within a function body".
						diagnosticCodesToIgnore: settings.allowReturn ? [1108] : []
					});

					if (settings.typings) {
						disposables.push(
							defaults.addExtraLib(settings.typings, `file:///${settings.key}-typings.d.ts`)
						);
					}
				}

				if (settings.language === 'filter') {
					registerFilterLanguage(monaco);
				}

				const extension = {
					javascript: 'js',
					typescript: 'ts',
					json: 'json',
					sql: 'sql',
					filter: 'filter'
				}[settings.language];
				const model = monaco.editor.createModel(
					settings.initial,
					settings.language === 'filter' ? FILTER_LANGUAGE : settings.language,
					monaco.Uri.parse(`file:///${settings.key}.${extension}`)
				);

				// The light theme, with scrollbars in the colors of `ScrollArea` (zinc 300/400/500).
				monaco.editor.defineTheme('pouchbase', {
					base: 'vs',
					inherit: true,
					// `variable`: `@request.*` and `@now` in filters.
					rules: [{ token: 'variable', foreground: '7c3aed' }],
					colors: {
						'scrollbar.shadow': '#00000000',
						'scrollbarSlider.background': '#d4d4d8',
						'scrollbarSlider.hoverBackground': '#a1a1aa',
						'scrollbarSlider.activeBackground': '#71717a'
					}
				});

				const instance = monaco.editor.create(node, {
					model,
					theme: 'pouchbase',
					readOnly: settings.readonly,
					automaticLayout: true,
					minimap: { enabled: false },
					scrollBeyondLastLine: false,
					fontSize: 12,
					lineHeight: 18,
					fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
					tabSize: 2,
					insertSpaces: false,
					lineNumbersMinChars: 3,
					overviewRulerLanes: 0,
					padding: { top: 8, bottom: 8 },
					renderLineHighlight: 'line',
					wordBasedSuggestions: 'off',
					quickSuggestions: {
						other: true,
						comments: false,
						strings: !!settings.completions?.some((completion) => completion.inString)
					},
					lineNumbers: settings.lineNumbers ? 'on' : 'off',
					placeholder: settings.placeholder,
					folding: settings.lineNumbers,
					glyphMargin: false,
					lineDecorationsWidth: settings.lineNumbers ? 10 : 8,
					overflowWidgetsDomNode: widgets,
					fixedOverflowWidgets: true,
					scrollbar: {
						useShadows: false,
						verticalScrollbarSize: 10,
						horizontalScrollbarSize: 10,
						verticalSliderSize: 6,
						horizontalSliderSize: 6
					}
				});

				// Label the control that actually receives focus.
				const input = node.querySelector('textarea');

				for (const [name, attribute] of Object.entries(aria)) {
					if (attribute !== undefined) {
						input?.setAttribute(name, String(attribute));
					}
				}

				if (settings.completions?.length) {
					disposables.push(
						...registerCompletions(monaco, settings.language, model, settings.completions)
					);
				}

				if (settings.language === 'filter') {
					disposables.push(registerFilterCompletions(monaco, model, () => filterNames));
				}

				disposables.push(
					instance.onDidChangeModelContent(() => {
						value = model.getValue();
						onValueChange?.(value);
					}),
					instance,
					model
				);

				editor = instance;
				monacoApi = monaco;
			})
			.catch((error: unknown) => {
				console.error('Could not load the code editor', error);
				failed = true;
			});

		return () => {
			disposed = true;
			editor = null;

			for (const disposable of disposables.reverse()) {
				disposable.dispose();
			}

			widgets.remove();
		};
	};

	// Problems are underlined again after every edit, and when `diagnostics` changes.
	$effect(() => {
		const model = editor?.getModel();
		const problems = diagnostics?.(value) ?? [];

		if (monacoApi && model) {
			setDiagnostics(monacoApi, model, problems);
		}
	});

	// Changes from outside (e.g. a form reset) are written into the editor.
	$effect(() => {
		const next = value;

		if (editor && editor.getValue() !== next) {
			editor.setValue(next);
		}
	});
</script>

<div
	role="presentation"
	class={[
		'relative h-64 overflow-hidden rounded-md border border-zinc-300 bg-white shadow-xs',
		'focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10',
		aria['aria-invalid'] === true || aria['aria-invalid'] === 'true'
			? 'border-red-500 ring-red-500/10'
			: '',
		className
	]}
	onkeydown={(event) => {
		// Monaco uses Escape itself (closing suggestions, hovers, the find widget). It must never
		// also close a surrounding dialog and throw away the code; Monaco has already handled it.
		if (event.key === 'Escape') {
			event.stopPropagation();
		}
	}}
>
	<div {@attach mount} {id} class="size-full"></div>

	{#if !editor}
		<div
			class="absolute inset-0 flex items-center justify-center gap-2 bg-white text-sm text-zinc-500"
		>
			{#if failed}
				The code editor could not be loaded.
			{:else}
				<Spinner.Root />
				Loading editor…
			{/if}
		</div>
	{/if}
</div>
