import type { Component } from 'svelte';
import { createContext } from 'svelte';

/** Props every dialog opened through `dialogs.open()` receives. */
export interface DialogProps<Result = void> {
	/** Closes the dialog; `open()` resolves with `result` (`undefined` when it was dismissed). */
	close: (result?: Result) => void;
}

type DialogResult<Props> = Props extends DialogProps<infer Result> ? Result : never;

/** The props a caller passes: everything except `close`, which the provider adds. */
type OpenArgs<Props> = keyof Omit<Props, 'close'> extends never
	? [props?: Omit<Props, 'close'>]
	: [props: Omit<Props, 'close'>];

interface DialogEntry {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: Component<any>;
	props: Record<string, unknown>;
	close: (result?: unknown) => void;
}

/**
 * The dialogs of the app, rendered one at a time inside the single `Dialog.Root` of
 * `Dialog.Provider`. Opening a dialog while another one is open replaces it.
 */
export class Dialogs {
	// Raw, so `current` keeps the identity of the entry (`close` compares against it).
	current = $state.raw<DialogEntry | null>(null);
	isOpen = $state(false);

	/**
	 * Opens `component` with `props`. Pass getters (`{ get fields() { return fields; } }`) for
	 * props that should stay in sync with the caller. Resolves when the dialog closes.
	 */
	open<Props extends DialogProps<never>>(
		component: Component<Props>,
		...[props]: OpenArgs<Props>
	): Promise<DialogResult<Props> | undefined> {
		this.current?.close();

		return new Promise((resolve) => {
			const entry: DialogEntry = {
				component,
				props: (props ?? {}) as Record<string, unknown>,
				close: (result) => {
					if (this.current !== entry) {
						return;
					}

					this.isOpen = false;
					resolve(result as DialogResult<Props> | undefined);
				}
			};

			this.current = entry;
			this.isOpen = true;
		});
	}

	/** Closes the open dialog without a result, e.g. on Escape or a click outside. */
	dismiss() {
		this.current?.close();
	}

	/** Unmounts the dialog once its close transition has finished. */
	cleanup() {
		if (!this.isOpen) {
			this.current = null;
		}
	}
}

export const [getDialogs, setDialogs] = createContext<Dialogs>();
