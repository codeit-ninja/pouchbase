import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			'no-undef': 'off'
		}
	},
	{
		rules: {
			// Always use braces for if/else, and keep a blank line around if statements.
			curly: ['error', 'all'],
			'padding-line-between-statements': [
				'error',
				{ blankLine: 'always', prev: '*', next: 'if' },
				{ blankLine: 'always', prev: 'if', next: '*' }
			]
		}
	}
);
