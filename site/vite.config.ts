import { icons as lucide } from '@iconify-json/lucide';
import { icons as simpleIcons } from '@iconify-json/simple-icons';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { iconify } from './vite/iconify.ts';

export default defineConfig({
	plugins: [
		iconify({ sets: [lucide, simpleIcons] }),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
});
