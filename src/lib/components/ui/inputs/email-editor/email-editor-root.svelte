<script module lang="ts">
	import type { Snippet } from 'svelte';
	import type { MailStyle } from '#lib/mail/layout.js';

	export type Props = {
		/** The editor's document as JSON, with variable tags such as `{{name}}` in its text. */
		value?: string;
		/** Colors and font of the email, so the content looks like it will. */
		mailStyle: MailStyle;
		/** Variables offered by "Insert variable". */
		variables?: string[];
		placeholder?: string;
		disabled?: boolean;
		/**
		 * Called once the editor has read `value`, with the JSON it writes for it; it can differ
		 * from `value` (attributes the editor adds), so callers can compare edits against it.
		 */
		onReady?: (value: string) => void;
		/** The toolbar, canvas and inspector, laid out by the caller. */
		children?: Snippet;
	};
</script>

<script lang="ts">
	import { Editor } from '@tiptap/core';
	import TextAlign from '@tiptap/extension-text-align';
	import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
	import { Placeholder } from '@tiptap/extensions';
	import StarterKit from '@tiptap/starter-kit';
	import { untrack } from 'svelte';
	import { EMPTY_DOCUMENT, parseDocument } from '#lib/mail/document.js';
	import { setEmailEditorContext } from './email-editor-context';
	import {
		EmailButton,
		EmailColumn,
		EmailColumns,
		EmailDivider,
		EmailImage,
		EmailSection,
		EmailSpacer,
		VariableHighlight
	} from './email-editor-nodes';

	let {
		value = $bindable(''),
		mailStyle,
		variables = [],
		placeholder = 'Write your email, or add blocks with Insert…',
		disabled = false,
		onReady,
		children
	}: Props = $props();

	let editor = $state.raw<Editor | null>(null);

	// Bumped on every editor transaction, so the toolbar's and inspector's states re-evaluate.
	let version = $state(0);

	function read(instance: Editor) {
		return JSON.stringify(instance.getJSON());
	}

	// Called from the canvas's attachment: nothing here may be tracked, or every change would
	// create the editor again.
	function mount(element: HTMLElement) {
		return untrack(() => create(element));
	}

	function create(element: HTMLElement) {
		const instance = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2, 3] },
					codeBlock: false,
					horizontalRule: false,
					link: {
						openOnClick: false,
						// Variables such as `{{url}}` are links too; they are filled in when sending.
						isAllowedUri: (url, context) =>
							/^\{\{[^}]+\}\}/.test(url) || context.defaultValidate(url)
					}
				}),
				TextStyle,
				Color,
				FontSize,
				TextAlign.configure({ types: ['heading', 'paragraph', 'emailButton'] }),
				EmailImage,
				EmailDivider,
				EmailButton,
				EmailSpacer,
				EmailSection,
				EmailColumns,
				EmailColumn,
				VariableHighlight,
				Placeholder.configure({ placeholder })
			],
			content: value ? parseDocument(value) : EMPTY_DOCUMENT,
			editable: !disabled,
			editorProps: {
				attributes: {
					role: 'textbox',
					'aria-multiline': 'true',
					'aria-label': 'Email content',
					class: 'email-canvas outline-none'
				}
			},
			onTransaction: () => {
				version++;
			},
			onUpdate: ({ editor: updated }) => {
				value = read(updated);
			}
		});

		editor = instance;
		onReady?.(read(instance));

		return () => {
			instance.destroy();
			editor = null;
		};
	}

	// Outside changes to `value` (e.g. discarding changes) are pushed into the editor.
	$effect(() => {
		if (editor && value !== untrack(() => read(editor!))) {
			editor.commands.setContent(parseDocument(value), { emitUpdate: false });
		}
	});

	$effect(() => {
		editor?.setEditable(!disabled);
	});

	setEmailEditorContext({
		get editor() {
			return editor;
		},
		get version() {
			return version;
		},
		get mailStyle() {
			return mailStyle;
		},
		get variables() {
			return variables;
		},
		get disabled() {
			return disabled;
		},
		mount
	});
</script>

{@render children?.()}
