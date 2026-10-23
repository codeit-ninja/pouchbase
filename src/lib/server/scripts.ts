import type { QuickJSContext, QuickJSHandle, QuickJSRuntime } from '@cf-wasm/quickjs';

import { getQuickJSWASMModule } from '@cf-wasm/quickjs';
import { slugify } from '#lib/fields/field-types.js';

/**
 * Runs user scripts (the functions of computed fields) in QuickJS, a JavaScript engine compiled to
 * WebAssembly. Workers can't `eval`, and a sandbox keeps scripts away from the network, the
 * database and secrets: they only see the values passed in. The `workerd` build of
 * `@cf-wasm/quickjs` loads its WASM as a module; `vite dev` and the Node target use the Node build.
 * Functions throw on errors; services wrap them in results.
 */

/** How long one call may run before it is interrupted. */
const TIME_LIMIT_MS = 100;
/** Memory of the whole sandbox, shared by all scripts in it. */
const MEMORY_LIMIT = 32 * 1024 * 1024;
const STACK_LIMIT = 512 * 1024;

/**
 * Runs inside the sandbox. The record and context cross the boundary as one JSON string, and the
 * result comes back as JSON, so no object handles leak between the two sides.
 */
const PRELUDE = `
globalThis.__run = (fn, input) => {
	const { record, ctx } = JSON.parse(input);
	ctx.slugify = __slugify;
	const value = fn(Object.freeze(record), Object.freeze(ctx));

	if (value && typeof value.then === 'function') {
		throw new TypeError('The function must return a value, not a promise; async is not supported');
	}

	// Functions and symbols have no JSON form; they count as no value.
	return JSON.stringify(value === undefined ? null : value) ?? 'null';
};
`;

/** A script that failed to compile or run; the message is meant for the person who wrote it. */
export class ScriptError extends Error {
	override name = 'ScriptError';
}

/** What a script gets as its second argument, besides helpers such as `slugify`. */
export type ScriptContext = {
	collection: string;
	/** True while the record is being created. */
	isNew: boolean;
	/** The stored record before this save; `null` for a new record. */
	previous: Record<string, unknown> | null;
};

/** `TypeError: x is undefined (line 3)`, from an error dumped out of the sandbox. */
function describe(dumped: unknown) {
	if (dumped && typeof dumped === 'object' && 'message' in dumped) {
		const { name, message, stack } = dumped as { name?: string; message?: string; stack?: string };
		// The script is wrapped in a function whose header is line 1, so its own lines start at 2.
		const line = Number(/script\.js:(\d+)/.exec(stack ?? '')?.[1]);
		const where = line > 1 ? ` (line ${line - 1})` : '';

		return message === 'interrupted'
			? `The script took longer than ${TIME_LIMIT_MS} ms`
			: `${name ?? 'Error'}: ${message}${where}`;
	}

	return String(dumped);
}

/**
 * A sandbox with one or more compiled scripts. Create it once for a batch of records (compiling
 * costs more than calling) and always `dispose()` it.
 */
export class ScriptSandbox {
	private readonly functions = new Map<string, QuickJSHandle>();

	private constructor(
		private readonly runtime: QuickJSRuntime,
		private readonly vm: QuickJSContext,
		private readonly run: QuickJSHandle,
		/** Read by the interrupt handler; reset before every compile and call. */
		private readonly clock: { deadline: number }
	) {}

	static async create() {
		const quickjs = await getQuickJSWASMModule();
		const runtime = quickjs.newRuntime();

		runtime.setMemoryLimit(MEMORY_LIMIT);
		runtime.setMaxStackSize(STACK_LIMIT);

		const vm = runtime.newContext();
		const clock = { deadline: Date.now() + TIME_LIMIT_MS };

		runtime.setInterruptHandler(() => Date.now() > clock.deadline);

		const helper = vm.newFunction('slugify', (text: QuickJSHandle) =>
			vm.newString(slugify(vm.getString(text)))
		);
		vm.setProp(vm.global, '__slugify', helper);
		helper.dispose();

		const prelude = vm.evalCode(PRELUDE, 'prelude.js');

		if (prelude.error) {
			const message = describe(vm.dump(prelude.error));
			prelude.error.dispose();
			vm.dispose();
			runtime.dispose();
			throw new Error(`Script prelude failed: ${message}`);
		}

		prelude.value.dispose();

		return new ScriptSandbox(runtime, vm, vm.getProp(vm.global, '__run'), clock);
	}

	/**
	 * Compiles a script: the body of a function of `record` and `ctx` that returns the value, e.g.
	 * `return ctx.slugify(record.title)`. Throws a `ScriptError` with a readable message when it
	 * doesn't compile.
	 */
	compile(key: string, source: string) {
		this.clock.deadline = Date.now() + TIME_LIMIT_MS;

		// Strict mode, so assigning to an undeclared name is an error instead of a new global.
		const result = this.vm.evalCode(
			`(function (record, ctx) { 'use strict';\n${source}\n})`,
			'script.js'
		);

		if (result.error) {
			const message = describe(this.vm.dump(result.error));
			result.error.dispose();
			throw new ScriptError(message);
		}

		this.functions.get(key)?.dispose();
		this.functions.set(key, result.value);
	}

	/**
	 * Calls a compiled script. Returns what it returned, as plain JSON data (`undefined` becomes
	 * `null`). Throws a `ScriptError` when it throws, runs too long or uses too much memory.
	 */
	call(key: string, record: Record<string, unknown>, context: ScriptContext): unknown {
		const fn = this.functions.get(key);

		if (!fn) {
			throw new Error(`Script "${key}" is not compiled`);
		}

		const input = this.vm.newString(JSON.stringify({ record, ctx: context }));
		this.clock.deadline = Date.now() + TIME_LIMIT_MS;

		const result = this.vm.callFunction(this.run, this.vm.undefined, fn, input);
		input.dispose();

		if (result.error) {
			const message = describe(this.vm.dump(result.error));
			result.error.dispose();
			throw new ScriptError(message);
		}

		const json = this.vm.getString(result.value);
		result.value.dispose();

		return JSON.parse(json) as unknown;
	}

	dispose() {
		for (const fn of this.functions.values()) {
			fn.dispose();
		}

		this.functions.clear();
		this.run.dispose();
		this.vm.dispose();
		this.runtime.dispose();
	}
}
