/**
 * Props of the Svelte components a plugin contributes. The host compiles these components on
 * install and renders them in the dashboard (client-side only).
 *
 * ```svelte
 * <script lang="ts">
 * 	import type { FieldInputProps } from '@pouchbasejs/plugin-sdk/ui';
 *
 * 	let { name, value, required, disabled }: FieldInputProps<string> = $props();
 * </script>
 *
 * <input type="color" {name} value={value ?? '#000000'} {required} {disabled} />
 * ```
 *
 * A UI file may import the `HOST_MODULES` and other files in the plugin's `ui/` directory,
 * nothing else.
 */

/**
 * Modules a UI file may import besides files in `ui/`. The host provides them at runtime, in the
 * versions the dashboard itself uses, so a plugin never bundles its own copy: `svelte` and its
 * subpaths, the prop types from `@pouchbasejs/plugin-sdk/ui`, and the dashboard's components from
 * `@pouchbasejs/ui` (`import * as Button from '@pouchbasejs/ui/button'`). Install them as
 * devDependencies for type checking only. A `/*` entry also allows every subpath.
 */
export const HOST_MODULES = [
	'svelte',
	'svelte/*',
	'@pouchbasejs/plugin-sdk/ui',
	'@pouchbasejs/ui',
	'@pouchbasejs/ui/*'
] as const;

/** Whether a UI file may import `specifier`, which is not a relative path. */
export function isHostModule(specifier: string): boolean {
	return HOST_MODULES.some((module) =>
		module.endsWith('/*')
			? specifier.startsWith(module.slice(0, -1)) && specifier.length > module.length - 1
			: specifier === module
	);
}

/** The field a component is rendered for. */
export type FieldInfo = {
	/** Column name. */
	name: string;
	/** `<plugin>:<type>`. */
	type: string;
	required: boolean;
	options: Record<string, unknown>;
};

export type FieldInputProps<T = unknown> = {
	field: FieldInfo;
	/**
	 * Name to give the form control that holds the value; it is submitted with the record form.
	 * Use a hidden `<input>` when the value is edited by something else.
	 */
	name: string;
	/** Current value; `null` for an empty or new record. */
	value: T | null;
	required: boolean;
	disabled: boolean;
	/** Id for the control, so the field label points at it. */
	id: string;
	/** Validation message from the last submit, to link with `aria-describedby`. */
	errorId?: string;
};

export type FieldCellProps<T = unknown> = {
	field: FieldInfo;
	value: T | null;
};

/** Calls the plugin's own `routes` with the admin's session. */
export type PluginApi = {
	fetch(path: `/${string}`, init?: RequestInit): Promise<Response>;
};

export type PageProps = {
	/** Path below the page, e.g. `['2026', '10']` for `/plugins/<plugin>/reports/2026/10`. */
	params: string[];
	api: PluginApi;
};
