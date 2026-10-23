/**
 * Splits a SQL dump into statements without holding all of it: `splitStatements` takes a chunk
 * of bytes and returns the complete statements in it, plus how many bytes they span, so the next
 * chunk starts right after the last one. It works on bytes because the characters that matter
 * (`;`, quotes, comment markers) are ASCII, and in UTF-8 no byte of another character equals one.
 */

const SEMICOLON = 0x3b;
const NEWLINE = 0x0a;
const DASH = 0x2d;
const SLASH = 0x2f;
const STAR = 0x2a;
const OPENING = { 0x27: 0x27, 0x22: 0x22, 0x60: 0x60, 0x5b: 0x5d } as Record<number, number>;

const TRIGGER = /^\s*CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i;
const TRIGGER_END = /\bEND\s*;\s*$/i;

export type SplitResult = {
	/** Each statement with the byte offset right after it. */
	statements: { sql: string; end: number }[];
	/** Bytes up to and including the last complete statement. */
	consumed: number;
};

/**
 * The complete statements in `bytes`. With `final`, the chunk is the end of the dump and a last
 * statement without `;` counts as complete too.
 */
export function splitStatements(bytes: Uint8Array, final: boolean): SplitResult {
	const decoder = new TextDecoder();
	const statements: SplitResult['statements'] = [];
	let start = 0;
	let consumed = 0;
	// The byte that ends the current quote or comment, if inside one.
	let closing: number | null = null;
	let lineComment = false;
	let blockComment = false;

	for (let index = 0; index < bytes.length; index++) {
		const byte = bytes[index];

		if (lineComment) {
			lineComment = byte !== NEWLINE;
			continue;
		}

		if (blockComment) {
			if (byte === STAR && bytes[index + 1] === SLASH) {
				blockComment = false;
				index++;
			}

			continue;
		}

		if (closing !== null) {
			// A doubled quote ('it''s') closes and reopens, which ends up inside the string again.
			if (byte === closing) {
				closing = null;
			}

			continue;
		}

		if (byte in OPENING) {
			closing = OPENING[byte];
		} else if (byte === DASH && bytes[index + 1] === DASH) {
			lineComment = true;
		} else if (byte === SLASH && bytes[index + 1] === STAR) {
			blockComment = true;
			index++;
		} else if (byte === SEMICOLON) {
			const text = decoder.decode(bytes.subarray(start, index + 1));

			// A trigger body has statements of its own; it ends with `END;`.
			if (TRIGGER.test(text) && !TRIGGER_END.test(text)) {
				continue;
			}

			if (text.replace(/;$/, '').trim()) {
				statements.push({ sql: text.trim(), end: index + 1 });
			}

			start = index + 1;
			consumed = start;
		}
	}

	if (final) {
		const rest = decoder.decode(bytes.subarray(start)).trim();

		if (rest && !/^(--[^\n]*\n?\s*)*$/.test(rest)) {
			statements.push({ sql: rest, end: bytes.length });
		}

		consumed = bytes.length;
	}

	return { statements, consumed };
}
