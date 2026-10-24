<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Button from '../../button/index.js';
	import * as Icon from '../../icon/index.js';
	import * as Inspector from '../../inspector/index.js';
	import type { ButtonSize } from '#lib/mail/document.js';
	import {
		BLOCK_DEFAULTS,
		BLOCK_MARGINS,
		blockMargins,
		columnWidths,
		MAX_BLOCK_MARGIN
	} from '#lib/mail/document.js';
	import type { SelectedBlock } from './email-editor-blocks';
	import {
		BLOCK_LABELS,
		canMoveBlock,
		columnRow,
		COLUMN_LAYOUTS,
		deleteBlock,
		duplicateBlock,
		maxColumnWidth,
		MIN_COLUMN_WIDTH,
		moveBlock,
		resizeColumn,
		rowWidths,
		selectedBlocks,
		setColumnLayout,
		TEXT_BLOCK_TYPES,
		updateBlock
	} from './email-editor-blocks';
	import { getEmailEditorContext } from './email-editor-context';

	type Props = {
		/** Shown when no block with settings is selected, e.g. the settings of the whole email. */
		fallback?: Snippet;
		class?: string;
	};

	let { fallback, class: className }: Props = $props();

	const context = getEmailEditorContext();
	const style = $derived(context.mailStyle);

	const blocks = $derived.by(() => {
		void context.version;

		return context.editor ? selectedBlocks(context.editor) : [];
	});

	const ICONS: Record<SelectedBlock['type'], string> = {
		emailButton: 'lucide:rectangle-horizontal',
		image: 'lucide:image',
		emailSpacer: 'lucide:move-vertical',
		horizontalRule: 'lucide:minus',
		emailColumn: 'lucide:rectangle-vertical',
		emailColumns: 'lucide:columns-3',
		emailSection: 'lucide:square',
		paragraph: 'lucide:pilcrow',
		heading: 'lucide:heading',
		bulletList: 'lucide:list',
		orderedList: 'lucide:list-ordered',
		blockquote: 'lucide:text-quote'
	};

	// Text blocks only have spacing; the email's settings stay visible below them.
	const showFallback = $derived(blocks.every((block) => TEXT_BLOCK_TYPES.includes(block.type)));

	const ALIGN_OPTIONS = [
		{ value: 'left', label: 'Left', icon: 'lucide:align-left' },
		{ value: 'center', label: 'Center', icon: 'lucide:align-center' },
		{ value: 'right', label: 'Right', icon: 'lucide:align-right' }
	] as const;

	const SIZE_OPTIONS: { value: ButtonSize; label: string }[] = [
		{ value: 'small', label: 'S' },
		{ value: 'medium', label: 'M' },
		{ value: 'large', label: 'L' }
	];

	function update(block: SelectedBlock, attrs: Record<string, unknown>) {
		if (context.editor) {
			updateBlock(context.editor, block.position, attrs);
		}
	}

	/** Replaces an image block's image with one the user picks; an empty alt text is filled in. */
	async function chooseImage(block: SelectedBlock) {
		const current = { src: block.node.attrs.src ?? '', alt: block.node.attrs.alt ?? '' };
		const image = await context.pickImage?.(current);

		if (image) {
			update(block, { src: image.src, alt: current.alt || image.alt });
		}
	}

	function id(block: SelectedBlock, name: string) {
		return `email-block-${block.position}-${name}`;
	}

	function layoutKey(widths: number[]) {
		return widths.join(':');
	}
</script>

{#snippet spacing(block: SelectedBlock)}
	{@const defaults = BLOCK_MARGINS[block.type as keyof typeof BLOCK_MARGINS]}
	{#if defaults}
		{@const margins = blockMargins(block.node.attrs, defaults)}
		{@const custom = block.node.attrs.marginTop != null || block.node.attrs.marginBottom != null}
		<div class="grid grid-cols-2 gap-3">
			<Inspector.Range
				label="Space above"
				id={id(block, 'margin-top')}
				value={margins.top}
				min={0}
				max={MAX_BLOCK_MARGIN}
				onValueChange={(marginTop) => update(block, { marginTop })}
			/>
			<Inspector.Range
				label="Space below"
				id={id(block, 'margin-bottom')}
				value={margins.bottom}
				min={0}
				max={MAX_BLOCK_MARGIN}
				onValueChange={(marginBottom) => update(block, { marginBottom })}
			/>
		</div>
		{#if custom}
			<Button.Root
				type="button"
				variant="ghost"
				class="self-start"
				onclick={() => update(block, { marginTop: null, marginBottom: null })}
			>
				<Icon.Root icon="lucide:rotate-ccw" />
				Default spacing
			</Button.Root>
		{/if}
	{/if}
{/snippet}

{#snippet blockActions(block: SelectedBlock)}
	{@const editor = context.editor!}
	<Button.Root
		type="button"
		variant="ghost"
		size="icon-sm"
		aria-label="Move up"
		title="Move up"
		disabled={!canMoveBlock(editor, block.position, -1)}
		onclick={() => moveBlock(editor, block.position, -1)}
	>
		<Icon.Root icon="lucide:arrow-up" />
	</Button.Root>
	<Button.Root
		type="button"
		variant="ghost"
		size="icon-sm"
		aria-label="Move down"
		title="Move down"
		disabled={!canMoveBlock(editor, block.position, 1)}
		onclick={() => moveBlock(editor, block.position, 1)}
	>
		<Icon.Root icon="lucide:arrow-down" />
	</Button.Root>
	<Button.Root
		type="button"
		variant="ghost"
		size="icon-sm"
		aria-label="Duplicate"
		title="Duplicate"
		onclick={() => duplicateBlock(editor, block.position)}
	>
		<Icon.Root icon="lucide:copy" />
	</Button.Root>
	<Button.Root
		type="button"
		variant="ghost"
		size="icon-sm"
		aria-label="Delete"
		title="Delete"
		class="hover:text-red-600"
		onclick={() => deleteBlock(editor, block.position)}
	>
		<Icon.Root icon="lucide:trash-2" />
	</Button.Root>
{/snippet}

<Inspector.Root class={className}>
	{#each blocks as block (`${block.type}-${block.position}`)}
		{@const attrs = block.node.attrs}
		<Inspector.Section title={BLOCK_LABELS[block.type]} icon={ICONS[block.type]}>
			{#snippet actions()}
				{@render blockActions(block)}
			{/snippet}

			{#if block.type === 'emailButton'}
				<Inspector.Text
					label="Links to"
					id={id(block, 'href')}
					value={attrs.href}
					placeholder={'https://… or {{url}}'}
					onValueChange={(href) => update(block, { href })}
				/>
				<div class="grid grid-cols-2 gap-3">
					<Inspector.Options
						label="Size"
						value={attrs.size}
						options={SIZE_OPTIONS}
						onValueChange={(size) => update(block, { size })}
					/>
					<Inspector.Options
						label="Alignment"
						value={attrs.textAlign ?? 'left'}
						options={[...ALIGN_OPTIONS]}
						onValueChange={(textAlign) => update(block, { textAlign })}
					/>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Inspector.Color
						label="Background"
						id={id(block, 'background')}
						value={attrs.backgroundColor}
						inherited={style.buttonColor}
						resetLabel="Use the email's button color"
						onValueChange={(backgroundColor) => update(block, { backgroundColor })}
					/>
					<Inspector.Color
						label="Text"
						id={id(block, 'text')}
						value={attrs.textColor}
						inherited={style.buttonTextColor}
						resetLabel="Use the email's button text color"
						onValueChange={(textColor) => update(block, { textColor })}
					/>
				</div>
				<Inspector.Range
					label="Corner radius"
					id={id(block, 'radius')}
					value={attrs.radius}
					min={0}
					max={40}
					onValueChange={(radius) => update(block, { radius })}
				/>
				<Inspector.Toggle
					label="Full width"
					id={id(block, 'full-width')}
					checked={attrs.fullWidth}
					onCheckedChange={(fullWidth) => update(block, { fullWidth })}
				/>
			{:else if block.type === 'image'}
				<Inspector.Text
					label="Image URL"
					id={id(block, 'src')}
					value={attrs.src ?? ''}
					placeholder={'https://… or {{imageUrl}}'}
					onValueChange={(src) => update(block, { src })}
				/>
				{#if context.pickImage}
					<Button.Root type="button" variant="secondary" onclick={() => void chooseImage(block)}>
						<Icon.Root icon="lucide:images" />
						Choose image…
					</Button.Root>
				{/if}
				<Inspector.Text
					label="Alternative text"
					id={id(block, 'alt')}
					value={attrs.alt ?? ''}
					description="Shown when images are blocked, and read by screen readers."
					onValueChange={(alt) => update(block, { alt })}
				/>
				<Inspector.Text
					label="Links to"
					id={id(block, 'href')}
					value={attrs.href ?? ''}
					placeholder="Optional"
					onValueChange={(href) => update(block, { href: href || null })}
				/>
				<Inspector.Options
					label="Alignment"
					value={attrs.align}
					options={[...ALIGN_OPTIONS]}
					onValueChange={(align) => update(block, { align })}
				/>
				<Inspector.Toggle
					label="Full width"
					id={id(block, 'full-width')}
					checked={attrs.width === null}
					onCheckedChange={(full) => update(block, { width: full ? null : 240 })}
				/>
				{#if attrs.width !== null}
					<Inspector.Range
						label="Width"
						id={id(block, 'width')}
						value={attrs.width}
						min={24}
						max={style.width}
						onValueChange={(width) => update(block, { width })}
					/>
				{/if}
				<Inspector.Range
					label="Corner radius"
					id={id(block, 'radius')}
					value={attrs.radius}
					min={0}
					max={64}
					onValueChange={(radius) => update(block, { radius })}
				/>
			{:else if block.type === 'emailSpacer'}
				<Inspector.Range
					label="Height"
					id={id(block, 'height')}
					value={attrs.height}
					min={4}
					max={160}
					step={4}
					onValueChange={(height) => update(block, { height })}
				/>
			{:else if block.type === 'horizontalRule'}
				<Inspector.Color
					label="Color"
					id={id(block, 'color')}
					value={attrs.color}
					inherited={BLOCK_DEFAULTS.divider.color}
					onValueChange={(color) => update(block, { color })}
				/>
				<Inspector.Range
					label="Thickness"
					id={id(block, 'thickness')}
					value={attrs.thickness}
					min={1}
					max={8}
					onValueChange={(thickness) => update(block, { thickness })}
				/>
			{:else if block.type === 'emailColumns'}
				{@const widths = columnWidths(block.node.toJSON().content ?? [])}
				<Inspector.Options
					label="Columns"
					value={String(block.node.childCount)}
					options={[1, 2, 3, 4].map((count) => ({ value: String(count), label: String(count) }))}
					onValueChange={(count) =>
						context.editor &&
						setColumnLayout(
							context.editor,
							block.position,
							COLUMN_LAYOUTS[Number(count)][0].widths
						)}
				/>
				{#if COLUMN_LAYOUTS[block.node.childCount].length > 1}
					<Inspector.Options
						label="Layout"
						value={layoutKey(widths)}
						options={COLUMN_LAYOUTS[block.node.childCount].map((layout) => ({
							value: layoutKey(layout.widths),
							label: layout.label
						}))}
						onValueChange={(key) =>
							context.editor &&
							setColumnLayout(context.editor, block.position, key.split(':').map(Number))}
					/>
				{/if}
				<Inspector.Range
					label="Space between"
					id={id(block, 'gap')}
					value={attrs.gap}
					min={0}
					max={64}
					step={4}
					onValueChange={(gap) => update(block, { gap })}
				/>
				<p class="text-xs text-zinc-500">On phones, the columns are shown below each other.</p>
			{:else if block.type === 'emailColumn'}
				{@const row = context.editor && columnRow(context.editor, block.position)}
				{#if row && row.row.childCount > 1}
					{@const widths = rowWidths(row.row)}
					<Inspector.Range
						label="Width"
						id={id(block, 'width')}
						value={widths[row.index]}
						min={MIN_COLUMN_WIDTH}
						max={maxColumnWidth(widths, row.index)}
						unit="%"
						onValueChange={(width) =>
							context.editor && resizeColumn(context.editor, block.position, width)}
					/>
				{/if}
				<Inspector.Options
					label="Vertical alignment"
					value={attrs.verticalAlign}
					options={[
						{ value: 'top', label: 'Top', icon: 'lucide:align-start-horizontal' },
						{ value: 'middle', label: 'Middle', icon: 'lucide:align-center-horizontal' },
						{ value: 'bottom', label: 'Bottom', icon: 'lucide:align-end-horizontal' }
					]}
					onValueChange={(verticalAlign) => update(block, { verticalAlign })}
				/>
				<Inspector.Color
					label="Background"
					id={id(block, 'background')}
					value={attrs.backgroundColor}
					inherited={style.contentColor}
					resetLabel="No background"
					onValueChange={(backgroundColor) => update(block, { backgroundColor })}
				/>
				<Inspector.Range
					label="Padding"
					id={id(block, 'padding')}
					value={attrs.padding}
					min={0}
					max={48}
					step={4}
					onValueChange={(padding) => update(block, { padding })}
				/>
			{:else if block.type === 'emailSection'}
				<div class="grid grid-cols-2 gap-3">
					<Inspector.Color
						label="Background"
						id={id(block, 'background')}
						value={attrs.backgroundColor}
						inherited={style.contentColor}
						resetLabel="No background"
						onValueChange={(backgroundColor) => update(block, { backgroundColor })}
					/>
					<Inspector.Color
						label="Text"
						id={id(block, 'text')}
						value={attrs.textColor}
						inherited={style.textColor}
						resetLabel="Use the email's text color"
						onValueChange={(textColor) => update(block, { textColor })}
					/>
				</div>
				<Inspector.Color
					label="Border"
					id={id(block, 'border')}
					value={attrs.borderColor}
					inherited={style.contentColor}
					resetLabel="No border"
					onValueChange={(borderColor) => update(block, { borderColor })}
				/>
				<Inspector.Range
					label="Padding"
					id={id(block, 'padding')}
					value={attrs.padding}
					min={0}
					max={64}
					step={4}
					onValueChange={(padding) => update(block, { padding })}
				/>
				<Inspector.Range
					label="Corner radius"
					id={id(block, 'radius')}
					value={attrs.radius}
					min={0}
					max={32}
					onValueChange={(radius) => update(block, { radius })}
				/>
			{/if}

			{@render spacing(block)}
		</Inspector.Section>
	{/each}

	{#if showFallback}
		{@render fallback?.()}
	{/if}
</Inspector.Root>
