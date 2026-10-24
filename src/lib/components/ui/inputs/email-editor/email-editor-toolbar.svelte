<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import * as Button from '../../button/index.js';
	import * as Dialog from '../../dialog/index.js';
	import * as DropdownMenu from '../../dropdown-menu/index.js';
	import * as Icon from '../../icon/index.js';
	import * as Color from '../color/index.js';
	import * as Select from '../select/index.js';
	import { insertBlock, INSERTABLE } from './email-editor-blocks';
	import { getEmailEditorContext } from './email-editor-context';
	import LinkDialog from './email-editor-link-dialog.svelte';

	let { class: className }: { class?: string } = $props();

	const context = getEmailEditorContext();
	const dialogs = Dialog.getDialogs();

	const editor = $derived(context.editor);
	const disabled = $derived(!editor || context.disabled);

	function active(name: string | Record<string, unknown>, attributes?: Record<string, unknown>) {
		void context.version;

		if (!editor) {
			return false;
		}

		return typeof name === 'string' ? editor.isActive(name, attributes) : editor.isActive(name);
	}

	const BLOCK_STYLES = [
		{ value: 'paragraph', label: 'Text' },
		{ value: 'h1', label: 'Heading 1' },
		{ value: 'h2', label: 'Heading 2' },
		{ value: 'h3', label: 'Heading 3' }
	];

	const blockStyle = $derived.by(() => {
		void context.version;

		for (const level of [1, 2, 3]) {
			if (active('heading', { level })) {
				return `h${level}`;
			}
		}

		return 'paragraph';
	});

	function setBlockStyle(value: string) {
		const chain = editor?.chain().focus();

		if (value === 'paragraph') {
			chain?.setParagraph().run();
		} else {
			chain?.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
		}
	}

	const FONT_SIZES = [
		{ value: 'default', label: 'Normal size' },
		{ value: '13px', label: 'Small' },
		{ value: '18px', label: 'Large' },
		{ value: '22px', label: 'Extra large' }
	];

	const fontSize = $derived.by(() => {
		void context.version;

		return (editor?.getAttributes('textStyle').fontSize as string | undefined) ?? 'default';
	});

	function setFontSize(value: string) {
		if (value === 'default') {
			editor?.chain().focus().unsetFontSize().run();
		} else {
			editor?.chain().focus().setFontSize(value).run();
		}
	}

	const textColor = $derived.by(() => {
		void context.version;

		const color = editor?.getAttributes('textStyle').color as string | undefined;

		// Colors parsed from HTML can come back as `rgb(…)`; the picker only takes hex.
		return color && /^#[0-9a-f]{6}$/i.test(color) ? color : context.mailStyle.textColor;
	});

	async function editLink() {
		if (!editor) {
			return;
		}

		const href = (editor.getAttributes('link').href as string | undefined) ?? '';
		const result = await dialogs.open(LinkDialog, { kind: 'link', url: href });

		if (!result) {
			editor.commands.focus();
		} else if ('remove' in result) {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
		} else if (editor.state.selection.empty && !href) {
			editor
				.chain()
				.focus()
				.insertContent({
					type: 'text',
					text: result.url,
					marks: [{ type: 'link', attrs: { href: result.url } }]
				})
				.run();
		} else {
			editor.chain().focus().extendMarkRange('link').setLink({ href: result.url }).run();
		}
	}

	async function insertButton() {
		const result = await dialogs.open(LinkDialog, { kind: 'button', label: 'Get started' });

		if (editor && result && 'url' in result) {
			insertBlock(editor, {
				type: 'emailButton',
				attrs: { href: result.url },
				content: [{ type: 'text', text: result.label || 'Open' }]
			});
		}
	}

	async function chooseImage() {
		if (context.pickImage) {
			return context.pickImage();
		}

		const result = await dialogs.open(LinkDialog, { kind: 'image' });

		return result && 'url' in result ? { src: result.url, alt: result.label } : undefined;
	}

	async function insertImage() {
		const image = await chooseImage();

		if (editor && image) {
			insertBlock(editor, { type: 'image', attrs: image });
		}
	}

	type Tool = { label: string; icon: string; active?: () => boolean; run: (e: Editor) => void };

	const marks: Tool[] = [
		{
			label: 'Bold',
			icon: 'lucide:bold',
			active: () => active('bold'),
			run: (e) => e.chain().focus().toggleBold().run()
		},
		{
			label: 'Italic',
			icon: 'lucide:italic',
			active: () => active('italic'),
			run: (e) => e.chain().focus().toggleItalic().run()
		},
		{
			label: 'Underline',
			icon: 'lucide:underline',
			active: () => active('underline'),
			run: (e) => e.chain().focus().toggleUnderline().run()
		},
		{
			label: 'Strikethrough',
			icon: 'lucide:strikethrough',
			active: () => active('strike'),
			run: (e) => e.chain().focus().toggleStrike().run()
		},
		{
			label: 'Link',
			icon: 'lucide:link',
			active: () => active('link'),
			run: () => void editLink()
		}
	];

	const alignments: Tool[] = [
		{
			label: 'Align left',
			icon: 'lucide:align-left',
			active: () => active({ textAlign: 'left' }),
			run: (e) => e.chain().focus().setTextAlign('left').run()
		},
		{
			label: 'Align center',
			icon: 'lucide:align-center',
			active: () => active({ textAlign: 'center' }),
			run: (e) => e.chain().focus().setTextAlign('center').run()
		},
		{
			label: 'Align right',
			icon: 'lucide:align-right',
			active: () => active({ textAlign: 'right' }),
			run: (e) => e.chain().focus().setTextAlign('right').run()
		}
	];

	const lists: Tool[] = [
		{
			label: 'Bullet list',
			icon: 'lucide:list',
			active: () => active('bulletList'),
			run: (e) => e.chain().focus().toggleBulletList().run()
		},
		{
			label: 'Numbered list',
			icon: 'lucide:list-ordered',
			active: () => active('orderedList'),
			run: (e) => e.chain().focus().toggleOrderedList().run()
		},
		{
			label: 'Quote',
			icon: 'lucide:quote',
			active: () => active('blockquote'),
			run: (e) => e.chain().focus().toggleBlockquote().run()
		}
	];
</script>

{#snippet tools(list: Tool[])}
	{#each list as tool (tool.label)}
		<Button.Root
			type="button"
			variant="ghost"
			size="icon"
			aria-label={tool.label}
			title={tool.label}
			aria-pressed={tool.active ? tool.active() : undefined}
			{disabled}
			class="aria-pressed:bg-zinc-200 aria-pressed:text-zinc-900"
			onclick={() => editor && tool.run(editor)}
		>
			<Icon.Root icon={tool.icon} />
		</Button.Root>
	{/each}
{/snippet}

{#snippet separator()}
	<span class="mx-1 h-5 w-px bg-zinc-200" aria-hidden="true"></span>
{/snippet}

<div
	role="toolbar"
	aria-label="Formatting"
	class={['flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-white p-1.5', className]}
>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger {disabled}>
			<Icon.Root icon="lucide:plus" />
			Insert
		</DropdownMenu.Trigger>

		<!-- The editor keeps the focus, so typing continues in what was inserted. -->
		<DropdownMenu.Content
			align="start"
			class="w-72"
			onCloseAutoFocus={(event) => event.preventDefault()}
		>
			<DropdownMenu.Item class="h-auto py-2" onSelect={() => void insertButton()}>
				<Icon.Root icon="lucide:rectangle-horizontal" />
				<span class="flex flex-col">
					Button
					<span class="text-xs text-zinc-500">A link that stands out</span>
				</span>
			</DropdownMenu.Item>
			<DropdownMenu.Item class="h-auto py-2" onSelect={() => void insertImage()}>
				<Icon.Root icon="lucide:image" />
				<span class="flex flex-col">
					Image
					<span class="text-xs text-zinc-500">From a URL or a variable</span>
				</span>
			</DropdownMenu.Item>
			{#each INSERTABLE as block (block.label)}
				<DropdownMenu.Item
					class="h-auto py-2"
					onSelect={() => editor && insertBlock(editor, block.content())}
				>
					<Icon.Root icon={block.icon} />
					<span class="flex flex-col">
						{block.label}
						<span class="text-xs text-zinc-500">{block.description}</span>
					</span>
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	{@render separator()}

	<Button.Root
		type="button"
		variant="ghost"
		size="icon"
		aria-label="Undo"
		title="Undo"
		{disabled}
		onclick={() => editor?.chain().focus().undo().run()}
	>
		<Icon.Root icon="lucide:undo-2" />
	</Button.Root>
	<Button.Root
		type="button"
		variant="ghost"
		size="icon"
		aria-label="Redo"
		title="Redo"
		{disabled}
		onclick={() => editor?.chain().focus().redo().run()}
	>
		<Icon.Root icon="lucide:redo-2" />
	</Button.Root>

	{@render separator()}

	<div class="grid w-64 grid-cols-2 gap-1">
		<Select.Root
			items={BLOCK_STYLES}
			value={blockStyle}
			{disabled}
			aria-label="Text style"
			onValueChange={setBlockStyle}
		/>
		<Select.Root
			items={FONT_SIZES}
			value={fontSize}
			{disabled}
			aria-label="Text size"
			onValueChange={setFontSize}
		/>
	</div>

	{@render separator()}
	{@render tools(marks)}

	<Color.Root
		value={textColor}
		aria-label="Text color"
		{disabled}
		class="w-28"
		onValueChange={(color) => editor?.chain().focus().setColor(color).run()}
	/>
	<Button.Root
		type="button"
		variant="ghost"
		size="icon"
		aria-label="Default text color"
		title="Default text color"
		{disabled}
		onclick={() => editor?.chain().focus().unsetColor().run()}
	>
		<Icon.Root icon="lucide:eraser" />
	</Button.Root>

	{@render separator()}
	{@render tools(alignments)}
	{@render separator()}
	{@render tools(lists)}

	<div class="ml-auto">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger variant="ghost" {disabled}>
				<Icon.Root icon="lucide:braces" />
				Variable
			</DropdownMenu.Trigger>

			<DropdownMenu.Content onCloseAutoFocus={(event) => event.preventDefault()}>
				{#each context.variables as name (name)}
					<DropdownMenu.Item
						onSelect={() => editor?.chain().focus().insertContent(`{{${name}}}`).run()}
					>
						<span class="font-mono text-xs">{`{{${name}}}`}</span>
					</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item disabled>Type {'{{name}}'} to add a variable</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
