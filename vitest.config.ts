import { defineConfig } from 'vitest/config';

// Unit tests of pure modules (no SvelteKit runtime); `#lib/*` resolves through package.json imports.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts']
	}
});
