import type { HighlightedCode, HighlightedToken, Snippet } from '#lib/highlight.js';
import type { HighlighterCore } from 'shiki/core';

import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import bash from 'shiki/langs/bash.mjs';
import html from 'shiki/langs/html.mjs';
import javascript from 'shiki/langs/javascript.mjs';
import json from 'shiki/langs/json.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import theme from 'shiki/themes/github-dark-default.mjs';

/**
 * Highlights code samples with Shiki, on the server only: with the JavaScript regex engine it runs
 * synchronously and without WebAssembly. The docs are prerendered, so this runs during the build.
 */

let highlighter: HighlighterCore | null = null;

function instance() {
	highlighter ??= createHighlighterCoreSync({
		themes: [theme],
		langs: [typescript, javascript, bash, json, html],
		engine: createJavaScriptRegexEngine()
	});

	return highlighter;
}

export function highlight({ language, code }: Snippet): HighlightedCode {
	const text = code.replace(/^\n/, '').trimEnd();
	const { tokens, fg } = instance().codeToTokens(text, { lang: language, theme: theme.name! });

	// Neighbours with the same color are merged, which keeps the page data small.
	const lines = tokens.map((line) =>
		line.reduce<HighlightedToken[]>((merged, token) => {
			const color = token.color && token.color !== fg ? token.color : undefined;
			const last = merged.at(-1);

			if (last && last.color === color) {
				last.text += token.content;
			} else {
				merged.push(color ? { text: token.content, color } : { text: token.content });
			}

			return merged;
		}, [])
	);

	return { text, lines };
}

/** Highlights every snippet of a page, keeping their names. */
export function highlightAll<T extends Record<string, Snippet>>(snippets: T) {
	return Object.fromEntries(
		Object.entries(snippets).map(([name, value]) => [name, highlight(value)])
	) as { [K in keyof T]: HighlightedCode };
}
