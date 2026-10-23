import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts', 'src/cli.ts'],
	format: 'esm',
	platform: 'neutral',
	// Only the `pouchbase` command (src/cli.ts) uses Node built-ins.
	deps: { neverBundle: [/^node:/] },
	target: 'es2022',
	dts: true,
	sourcemap: true,
	clean: true
});
