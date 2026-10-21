<script module lang="ts">
	import type { RichTextFormat } from '#lib/fields/field-types.js';

	export type Props = {
		/** HTML or Markdown, depending on `format`. */
		value?: string;
		/** What `value` contains. Changing it re-creates the editor. */
		format?: RichTextFormat;
		placeholder?: string;
		id?: string;
		disabled?: boolean;
		class?: string;
		'aria-invalid'?: boolean | 'true' | 'false';
		'aria-describedby'?: string;
		'aria-labelledby'?: string;
	};
</script>

<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { Editor } from '@tiptap/core';
	import { Placeholder } from '@tiptap/extensions';
	import { Markdown } from '@tiptap/markdown';
	import StarterKit from '@tiptap/starter-kit';
	import { untrack } from 'svelte';
	import * as Button from '../../button';
	import * as Icon from '../../icon';

	let {
		value = $bindable(''),
		format = 'html',
		placeholder = '',
		id,
		disabled = false,
		class: className,
		...aria
	}: Props = $props();

	let editor = $state.raw<Editor | null>(null);

	// Bumped on every editor transaction, so the toolbar's active states re-evaluate.
	let version = $state(0);

	function read(instance: Editor) {
		return format === 'markdown' ? instance.getMarkdown() : instance.getHTML();
	}

	const mount: Attachment<HTMLDivElement> = (node) => {
		// Only `format` is tracked: the editor is re-created when it changes, not on every keystroke.
		const contentType = format;

		const instance = untrack(
			() =>
				new Editor({
					element: node,
					extensions: [
						StarterKit,
						Placeholder.configure({ placeholder }),
						...(contentType === 'markdown' ? [Markdown] : [])
					],
					content: value,
					contentType,
					editable: !disabled,
					editorProps: {
						attributes: {
							...(id ? { id } : {}),
							...Object.fromEntries(
								Object.entries(aria)
									.filter(([, attribute]) => attribute !== undefined)
									.map(([key, attribute]) => [key, String(attribute)])
							),
							role: 'textbox',
							'aria-multiline': 'true',
							class:
								'prose prose-sm prose-zinc min-h-32 max-w-none px-3 py-2 outline-none [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-zinc-400 [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]'
						}
					},
					onTransaction: () => {
						version++;
					},
					onUpdate: ({ editor: updated }) => {
						value = read(updated);
					}
				})
		);

		editor = instance;

		return () => {
			instance.destroy();
			editor = null;
		};
	};

	// Outside changes to `value` (e.g. a reset) are pushed into the editor.
	$effect(() => {
		if (editor && value !== untrack(() => read(editor!))) {
			editor.commands.setContent(value, { contentType: format, emitUpdate: false });
		}
	});

	$effect(() => {
		editor?.setEditable(!disabled);
	});

	function isActive(name: string, attributes?: Record<string, unknown>) {
		void version;

		return editor?.isActive(name, attributes) ?? false;
	}

	const tools = [
		{
			label: 'Bold',
			icon: 'lucide:bold',
			active: () => isActive('bold'),
			run: (e: Editor) => e.chain().focus().toggleBold().run()
		},
		{
			label: 'Italic',
			icon: 'lucide:italic',
			active: () => isActive('italic'),
			run: (e: Editor) => e.chain().focus().toggleItalic().run()
		},
		{
			label: 'Strikethrough',
			icon: 'lucide:strikethrough',
			active: () => isActive('strike'),
			run: (e: Editor) => e.chain().focus().toggleStrike().run()
		},
		{
			label: 'Heading',
			icon: 'lucide:heading-2',
			active: () => isActive('heading', { level: 2 }),
			run: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run()
		},
		{
			label: 'Bullet list',
			icon: 'lucide:list',
			active: () => isActive('bulletList'),
			run: (e: Editor) => e.chain().focus().toggleBulletList().run()
		},
		{
			label: 'Numbered list',
			icon: 'lucide:list-ordered',
			active: () => isActive('orderedList'),
			run: (e: Editor) => e.chain().focus().toggleOrderedList().run()
		},
		{
			label: 'Quote',
			icon: 'lucide:quote',
			active: () => isActive('blockquote'),
			run: (e: Editor) => e.chain().focus().toggleBlockquote().run()
		},
		{
			label: 'Code block',
			icon: 'lucide:code-xml',
			active: () => isActive('codeBlock'),
			run: (e: Editor) => e.chain().focus().toggleCodeBlock().run()
		}
	];
</script>

<div
	class={[
		'flex flex-col overflow-hidden rounded-md border border-zinc-300 bg-white shadow-xs focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10',
		aria['aria-invalid'] === true || aria['aria-invalid'] === 'true'
			? 'border-red-500 ring-red-500/10'
			: '',
		disabled && 'opacity-50',
		className
	]}
>
	<div
		role="toolbar"
		aria-label="Formatting"
		class="flex flex-wrap gap-0.5 border-b border-zinc-200 bg-zinc-50 p-1"
	>
		{#each tools as tool (tool.label)}
			<Button.Root
				type="button"
				variant="ghost"
				size="icon"
				aria-label={tool.label}
				aria-pressed={tool.active()}
				disabled={!editor || disabled}
				class="aria-pressed:bg-zinc-200 aria-pressed:text-zinc-900"
				onclick={() => editor && tool.run(editor)}
			>
				<Icon.Root icon={tool.icon} />
			</Button.Root>
		{/each}
	</div>

	<div {@attach mount}></div>
</div>
