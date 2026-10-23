<script lang="ts">
	import * as Inspector from '#lib/components/ui/inspector/index.js';
	import type { MailFont, MailStyle } from '#lib/mail/layout.js';

	type Props = { style: MailStyle };

	let { style = $bindable() }: Props = $props();

	function set(changes: Partial<MailStyle>) {
		style = { ...style, ...changes };
	}

	const FONTS: { value: MailFont; label: string }[] = [
		{ value: 'sans', label: 'Sans' },
		{ value: 'serif', label: 'Serif' },
		{ value: 'mono', label: 'Mono' }
	];
</script>

<!-- The settings of the whole email, shown while no block is selected. -->
<Inspector.Section title="Email" icon="lucide:mail">
	<p class="-mt-2 text-xs text-zinc-500">
		Select a button, image, section or column to change it, or change the whole email here.
	</p>
</Inspector.Section>

<Inspector.Section title="Layout" icon="lucide:layout-template">
	<div class="grid grid-cols-2 gap-3">
		<Inspector.Color
			label="Background"
			id="mail-style-background"
			value={style.backgroundColor}
			onValueChange={(value) => value && set({ backgroundColor: value })}
		/>
		<Inspector.Color
			label="Card"
			id="mail-style-card"
			value={style.contentColor}
			onValueChange={(value) => value && set({ contentColor: value })}
		/>
	</div>
	<Inspector.Range
		label="Width"
		id="mail-style-width"
		value={style.width}
		min={320}
		max={800}
		step={10}
		onValueChange={(width) => set({ width })}
	/>
	<Inspector.Range
		label="Padding"
		id="mail-style-padding"
		value={style.padding}
		min={0}
		max={64}
		step={4}
		onValueChange={(padding) => set({ padding })}
	/>
	<Inspector.Range
		label="Corner radius"
		id="mail-style-radius"
		value={style.radius}
		min={0}
		max={32}
		onValueChange={(radius) => set({ radius })}
	/>
</Inspector.Section>

<Inspector.Section title="Text" icon="lucide:type">
	<Inspector.Options
		label="Font"
		value={style.font}
		options={FONTS}
		onValueChange={(font) => set({ font })}
	/>
	<Inspector.Range
		label="Text size"
		id="mail-style-font-size"
		value={style.fontSize}
		min={12}
		max={20}
		onValueChange={(fontSize) => set({ fontSize })}
	/>
	<div class="grid grid-cols-2 gap-3">
		<Inspector.Color
			label="Text"
			id="mail-style-text"
			value={style.textColor}
			onValueChange={(value) => value && set({ textColor: value })}
		/>
		<Inspector.Color
			label="Links"
			id="mail-style-links"
			value={style.linkColor}
			onValueChange={(value) => value && set({ linkColor: value })}
		/>
	</div>
</Inspector.Section>

<Inspector.Section title="Buttons" icon="lucide:rectangle-horizontal">
	<div class="grid grid-cols-2 gap-3">
		<Inspector.Color
			label="Background"
			id="mail-style-button"
			value={style.buttonColor}
			onValueChange={(value) => value && set({ buttonColor: value })}
		/>
		<Inspector.Color
			label="Text"
			id="mail-style-button-text"
			value={style.buttonTextColor}
			onValueChange={(value) => value && set({ buttonTextColor: value })}
		/>
	</div>
	<p class="text-xs text-zinc-500">Each button can have colors of its own.</p>
</Inspector.Section>

<Inspector.Section title="Logo" icon="lucide:image">
	<Inspector.Text
		label="Image URL"
		id="mail-style-logo"
		value={style.logoUrl}
		placeholder="https://example.com/logo.png"
		description="Shown above the content. Leave empty for none."
		onValueChange={(logoUrl) => set({ logoUrl })}
	/>
	{#if style.logoUrl}
		<Inspector.Range
			label="Height"
			id="mail-style-logo-height"
			value={style.logoHeight}
			min={16}
			max={120}
			step={2}
			onValueChange={(logoHeight) => set({ logoHeight })}
		/>
		<Inspector.Options
			label="Alignment"
			value={style.logoAlign}
			options={[
				{ value: 'left', label: 'Left', icon: 'lucide:align-left' },
				{ value: 'center', label: 'Center', icon: 'lucide:align-center' }
			]}
			onValueChange={(logoAlign) => set({ logoAlign })}
		/>
	{/if}
</Inspector.Section>
