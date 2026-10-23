export type Variant = 'success' | 'error' | 'info';

export interface ToastOptions {
	/** Secondary line under the message. */
	description?: string;
	/** Milliseconds before the toast closes itself; `Infinity` keeps it open. */
	duration?: number;
}

export interface ToastEntry {
	id: number;
	variant: Variant;
	message: string;
	description?: string;
	duration: number;
}

const DEFAULT_DURATION = 4000;
// Errors stay a little longer, there is usually more to read.
const ERROR_DURATION = 6000;
// Older toasts are dropped once there are more than this many.
const MAX_TOASTS = 5;

/**
 * The toasts on screen, rendered by the single `Toast.Root` in the root layout. Toasts are only
 * added from event handlers in the browser, so sharing this module-level state is safe during SSR.
 */
class Toasts {
	items = $state<ToastEntry[]>([]);

	#nextId = 0;

	show(variant: Variant, message: string, options: ToastOptions = {}): number {
		const id = this.#nextId++;

		this.items = [
			...this.items.slice(-(MAX_TOASTS - 1)),
			{
				id,
				variant,
				message,
				description: options.description,
				duration: options.duration ?? (variant === 'error' ? ERROR_DURATION : DEFAULT_DURATION)
			}
		];

		return id;
	}

	dismiss(id: number) {
		this.items = this.items.filter((item) => item.id !== id);
	}
}

export const toasts = new Toasts();

/** Shows a short message at the bottom of the screen, e.g. `toast.success('Record saved')`. */
export const toast = {
	success: (message: string, options?: ToastOptions) => toasts.show('success', message, options),
	error: (message: string, options?: ToastOptions) => toasts.show('error', message, options),
	info: (message: string, options?: ToastOptions) => toasts.show('info', message, options),
	dismiss: (id: number) => toasts.dismiss(id)
};
