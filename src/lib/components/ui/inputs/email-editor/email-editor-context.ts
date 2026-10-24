import type { Editor } from '@tiptap/core';
import { createContext } from 'svelte';
import type { MailStyle } from '#lib/mail/layout.js';
import type { PickedImage } from './email-editor-root.svelte';

export interface EmailEditorContext {
	/** `null` until the canvas has mounted the editor. */
	readonly editor: Editor | null;
	/** Bumped on every change and selection change, so the toolbar and inspector update. */
	readonly version: number;
	readonly mailStyle: MailStyle;
	/** Variables offered by "Insert variable". */
	readonly variables: string[];
	readonly disabled: boolean;
	/** Chooses an image; `undefined` when images are only added by URL. */
	readonly pickImage: ((current?: PickedImage) => Promise<PickedImage | undefined>) | undefined;
	/** Creates the editor in the canvas's element; returns what destroys it. */
	mount(element: HTMLElement): () => void;
}

export const [getEmailEditorContext, setEmailEditorContext] = createContext<EmailEditorContext>();
