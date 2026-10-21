import { createContext } from 'svelte';

export interface StepsContext {
	/** Index of the active step. */
	readonly current: number;
}

export const [getStepsContext, setStepsContext] = createContext<StepsContext>();
