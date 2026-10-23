<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { HTMLAttributes } from 'svelte/elements';
	import { FONT_STACKS } from '#lib/mail/layout.js';
	import { getEmailEditorContext } from './email-editor-context';

	let { class: className, ...rest }: HTMLAttributes<HTMLDivElement> = $props();

	const context = getEmailEditorContext();
	const style = $derived(context.mailStyle);

	const mount: Attachment<HTMLDivElement> = (element) => context.mount(element);
</script>

<!--
	The email as it will look: the card with its colors, font and logo on its background. The
	editor's content inherits them; blocks draw their own settings (see `email-editor-nodes.ts`).
-->
<div
	{...rest}
	class={['email-canvas-frame overflow-auto px-4 py-8', className]}
	style:background={style.backgroundColor}
	style:--mail-link={style.linkColor}
	style:--mail-button={style.buttonColor}
	style:--mail-button-text={style.buttonTextColor}
>
	<div
		class="mx-auto max-w-full shadow-sm"
		style:width="{style.width}px"
		style:background={style.contentColor}
		style:color={style.textColor}
		style:font-family={FONT_STACKS[style.font]}
		style:font-size="{style.fontSize}px"
		style:padding="{style.padding}px"
		style:border-radius="{style.radius}px"
	>
		{#if style.logoUrl}
			<div class="mb-6" style:text-align={style.logoAlign}>
				{#if style.logoUrl.includes('{{')}
					<span
						class="inline-flex items-center rounded border border-dashed border-zinc-300 px-3 text-xs text-zinc-500"
						style:height="{style.logoHeight}px"
					>
						Logo: {style.logoUrl}
					</span>
				{:else}
					<img
						src={style.logoUrl}
						alt="Logo"
						class="inline-block w-auto"
						style:height="{style.logoHeight}px"
					/>
				{/if}
			</div>
		{/if}

		<div {@attach mount}></div>
	</div>
</div>

<style>
	/* The editor's content is ProseMirror's DOM, which utility classes can't reach. */
	.email-canvas-frame :global(.email-canvas) {
		line-height: 1.6;
		min-height: 12rem;
	}

	.email-canvas-frame :global(.email-canvas > * + *),
	.email-canvas-frame :global(.email-section > * + *),
	.email-canvas-frame :global(.email-column > * + *) {
		margin-top: 0;
	}

	.email-canvas-frame :global(.email-canvas p),
	.email-canvas-frame :global(.email-canvas ul),
	.email-canvas-frame :global(.email-canvas ol),
	.email-canvas-frame :global(.email-canvas blockquote) {
		margin: 0 0 16px;
	}

	.email-canvas-frame :global(.email-canvas li > p) {
		margin: 0;
	}

	.email-canvas-frame :global(.email-canvas ul) {
		list-style: disc;
		padding-left: 24px;
	}

	.email-canvas-frame :global(.email-canvas ol) {
		list-style: decimal;
		padding-left: 24px;
	}

	.email-canvas-frame :global(.email-canvas h1),
	.email-canvas-frame :global(.email-canvas h2),
	.email-canvas-frame :global(.email-canvas h3) {
		margin: 0 0 12px;
		font-weight: 700;
		line-height: 1.3;
	}

	.email-canvas-frame :global(.email-canvas h1) {
		font-size: 1.85em;
	}

	.email-canvas-frame :global(.email-canvas h2) {
		font-size: 1.45em;
	}

	.email-canvas-frame :global(.email-canvas h3) {
		font-size: 1.2em;
	}

	.email-canvas-frame :global(.email-canvas a) {
		color: var(--mail-link);
		text-decoration: underline;
	}

	.email-canvas-frame :global(.email-canvas blockquote) {
		border-left: 3px solid var(--mail-link);
		padding: 4px 0 4px 16px;
		opacity: 0.85;
	}

	.email-canvas-frame :global(.email-canvas hr) {
		margin: 24px 0;
		cursor: pointer;
	}

	.email-canvas-frame :global(.email-canvas img) {
		margin-bottom: 16px;
		cursor: pointer;
		/* Visible while the image is loading or can't be loaded. */
		min-height: 40px;
		background: #f4f4f5;
	}

	.email-canvas-frame :global(.email-image-placeholder) {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 120px;
		margin-bottom: 16px;
		border: 1px dashed #a1a1aa;
		background: #f4f4f5;
		color: #71717a;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 12px;
		cursor: pointer;
	}

	.email-canvas-frame :global([data-email-button]) {
		margin: 8px 0 24px;
	}

	.email-canvas-frame :global(.email-button) {
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
		min-width: 2rem;
	}

	/* The structure of the email, visible while editing only. */
	.email-canvas-frame :global(.email-section),
	.email-canvas-frame :global(.email-columns) {
		margin-bottom: 16px;
		outline: 1px dashed transparent;
		outline-offset: 2px;
		transition: outline-color 0.15s;
	}

	.email-canvas-frame :global(.email-section:hover),
	.email-canvas-frame :global(.email-column:hover) {
		outline: 1px dashed #a1a1aa;
	}

	.email-canvas-frame :global(.email-columns) {
		display: flex;
	}

	.email-canvas-frame :global(.email-column) {
		min-width: 0;
		outline: 1px dashed #e4e4e7;
		outline-offset: 2px;
	}

	.email-canvas-frame :global(.email-spacer) {
		cursor: pointer;
		background: repeating-linear-gradient(
			-45deg,
			transparent 0 6px,
			rgb(161 161 170 / 0.15) 6px 12px
		);
		border-radius: 4px;
	}

	.email-canvas-frame :global(.ProseMirror-selectednode) {
		outline: 2px solid #3b82f6 !important;
		outline-offset: 2px;
	}

	.email-canvas-frame :global(.email-variable) {
		border-radius: 4px;
		background: rgb(59 130 246 / 0.12);
		box-shadow: 0 0 0 1px rgb(59 130 246 / 0.25);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.88em;
		padding: 0 2px;
	}

	.email-canvas-frame :global(.email-variable-block) {
		background: rgb(168 85 247 / 0.12);
		box-shadow: 0 0 0 1px rgb(168 85 247 / 0.3);
	}

	.email-canvas-frame :global(.email-canvas p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
		color: #a1a1aa;
	}
</style>
