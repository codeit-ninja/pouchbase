import { createContext } from 'svelte';

export type ItemVariant = 'default' | 'danger';

export interface SortableContext {
	/** Index of the item being dragged. */
	readonly dragging: number | null;
	/** Whether the dragged item is settling into its slot after it was let go. */
	readonly dropping: boolean;
	/** Vertical offset of an item while dragging, in pixels. */
	offset(index: number): number;
	/** Starts dragging an item from its handle. */
	grab(index: number, event: PointerEvent): void;
	/** Moves an item with the keyboard. */
	move(from: number, to: number): Promise<void>;
}

export interface SortableItemContext {
	readonly index: number;
	readonly variant: ItemVariant;
}

export const [getSortableContext, setSortableContext] = createContext<SortableContext>();
export const [getSortableItemContext, setSortableItemContext] =
	createContext<SortableItemContext>();
