/**
 * Code samples with syntax highlighting. Pages keep their samples in a `snippets.ts` next to them;
 * their `+page.server.ts` highlights them with `#lib/server/highlight.ts` (Shiki), so Shiki never
 * reaches the browser, and `CodeBlock.Source` renders the result.
 */

export type Language = 'typescript' | 'javascript' | 'bash' | 'json' | 'html';

export interface Snippet {
	language: Language;
	/** The code; one leading newline and trailing whitespace are dropped. */
	code: string;
}

export interface HighlightedToken {
	text: string;
	/** A CSS color; tokens without one take the block's text color. */
	color?: string;
}

export interface HighlightedCode {
	/** The code as text, e.g. for a copy button. */
	text: string;
	lines: HighlightedToken[][];
}

export function snippet(language: Language, code: string): Snippet {
	return { language, code };
}
