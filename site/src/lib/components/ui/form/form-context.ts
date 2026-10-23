import type { RemoteForm, RemoteFormField, RemoteFormInput } from '$app/server';
import { createContext } from 'svelte';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRemoteForm = Omit<RemoteForm<RemoteFormInput | void, any>, 'for'>;
/** A field of any value type; each part calls `as(...)` with the input type it renders. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRemoteFormField = RemoteFormField<any>;

export interface FormContext {
	readonly form: AnyRemoteForm;
}

export interface FieldContext {
	readonly field: AnyRemoteFormField;
	/** Id of the control; Label, Description and Errors derive their ids from it. */
	readonly id: string;
}

export const [getFormContext, setFormContext] = createContext<FormContext>();
export const [getFieldContext, setFieldContext] = createContext<FieldContext>();
