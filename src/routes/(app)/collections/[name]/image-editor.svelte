<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { refreshAll } from '$app/navigation';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Cropper from '#lib/components/ui/cropper/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Checkbox from '#lib/components/ui/inputs/checkbox/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import * as Slider from '#lib/components/ui/inputs/slider/index.js';
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import * as Swatch from '#lib/components/ui/swatch/index.js';
	import { toast } from '#lib/components/ui/toast/index.js';
	import {
		ADJUSTMENT_RANGES,
		cssFilter,
		DEFAULT_JPEG_QUALITY,
		defaultOutputFormat,
		FILTER_PRESETS,
		isNeutral,
		NEUTRAL_ADJUSTMENTS,
		OUTPUT_FORMATS,
		sameAdjustments,
		type Adjustments,
		type OutputFormat
	} from '#lib/files/image-edits.js';
	import { editImage } from './records.remote';

	type Props = {
		fileId: string;
		/** Current name and type of the file, e.g. to name a converted copy. */
		name: string;
		mimeType: string;
		/** The loaded original. */
		image: HTMLImageElement;
		/** Called after the edited image has been saved. */
		onSaved: () => void;
	};

	let { fileId, name, mimeType, image, onSaved }: Props = $props();

	type Rotation = 0 | 90 | 180 | 270;
	type Tab = 'crop' | 'adjust' | 'filters' | 'export';

	/** Everything the user can change; one snapshot of it is one step in the undo history. */
	type EditorState = {
		rotation: Rotation;
		flipHorizontal: boolean;
		flipVertical: boolean;
		/** Key of `aspects`. */
		aspect: string;
		area: Cropper.Area;
		resize: { enabled: boolean; width: number };
		adjustments: Adjustments;
		format: OutputFormat;
		quality: number;
	};

	/** Longest side of the preview canvas; edits are applied to the full image on the server. */
	const PREVIEW_SIZE = 1600;
	const MAX_DIMENSION = 8000;
	const MAX_HISTORY = 50;

	const aspects: { key: string; label: string }[] = [
		{ key: 'free', label: 'Free' },
		{ key: 'original', label: 'Original' },
		{ key: '1:1', label: '1:1' },
		{ key: '4:3', label: '4:3' },
		{ key: '3:2', label: '3:2' },
		{ key: '16:9', label: '16:9' },
		{ key: '4:5', label: '4:5' },
		{ key: '9:16', label: '9:16' }
	];

	const adjustmentControls: { key: keyof Adjustments; label: string; unit?: string }[] = [
		{ key: 'brightness', label: 'Brightness' },
		{ key: 'contrast', label: 'Contrast' },
		{ key: 'saturation', label: 'Saturation' },
		{ key: 'hue', label: 'Hue', unit: '°' },
		{ key: 'grayscale', label: 'Grayscale' },
		{ key: 'sepia', label: 'Sepia' }
	];

	const scales = [25, 50, 75];

	const uid = $props.id();

	let tab = $state<Tab>('crop');
	let failure = $state('');
	let comparing = $state(false);
	let edit = $state<EditorState>(initialState());

	// Undo history: `committed` is the current step, `past` and `future` the ones around it.
	let committed = initialState();
	let past = $state.raw<EditorState[]>([]);
	let future = $state.raw<EditorState[]>([]);

	const pristineJson = JSON.stringify(initialState());
	const pristine = $derived(JSON.stringify(edit) === pristineJson);

	/** Image size after rotating; crop coordinates are in this space, like on the server. */
	const size = $derived(rotatedSize(edit.rotation));

	const cropWidth = $derived(Math.round(edit.area.width));
	const cropHeight = $derived(Math.round(edit.area.height));
	// Resizing keeps the selection's aspect ratio, so the result is never distorted.
	const resizeHeight = $derived(
		Math.max(1, Math.round((edit.resize.width * edit.area.height) / edit.area.width))
	);
	const outputWidth = $derived(edit.resize.enabled ? edit.resize.width : cropWidth);
	const outputHeight = $derived(edit.resize.enabled ? resizeHeight : cropHeight);
	const tooLarge = $derived(outputWidth > MAX_DIMENSION || outputHeight > MAX_DIMENSION);

	const filter = $derived(comparing ? 'none' : cssFilter(edit.adjustments));
	const originalFormat = $derived(defaultOutputFormat(mimeType));
	const outputName = $derived.by(() => {
		if (edit.format === originalFormat) {
			return name;
		}

		const extension = OUTPUT_FORMATS.find((format) => format.value === edit.format)?.label;
		const baseName = name.replace(/\.[^.]+$/, '') || 'image';

		return `${baseName}.${extension === 'JPEG' ? 'jpg' : extension?.toLowerCase()}`;
	});

	function rotatedSize(rotation: Rotation) {
		return rotation % 180
			? { width: image.naturalHeight, height: image.naturalWidth }
			: { width: image.naturalWidth, height: image.naturalHeight };
	}

	function initialState(): EditorState {
		const { width, height } = rotatedSize(0);

		return {
			rotation: 0,
			flipHorizontal: false,
			flipVertical: false,
			aspect: 'free',
			area: { x: 0, y: 0, width, height },
			resize: { enabled: false, width },
			adjustments: { ...NEUTRAL_ADJUSTMENTS },
			format: defaultOutputFormat(mimeType),
			quality: DEFAULT_JPEG_QUALITY
		};
	}

	function aspectRatio(key: string) {
		if (key === 'free') {
			return null;
		}

		if (key === 'original') {
			return size.width / size.height;
		}

		const [width, height] = key.split(':').map(Number);

		return width / height;
	}

	/** The largest centered area with the chosen aspect ratio, or the whole image. */
	function fullArea(): Cropper.Area {
		const { width, height } = size;
		const ratio = aspectRatio(edit.aspect);

		if (!ratio) {
			return { x: 0, y: 0, width, height };
		}

		let areaWidth = width;
		let areaHeight = areaWidth / ratio;

		if (areaHeight > height) {
			areaHeight = height;
			areaWidth = areaHeight * ratio;
		}

		return {
			x: (width - areaWidth) / 2,
			y: (height - areaHeight) / 2,
			width: areaWidth,
			height: areaHeight
		};
	}

	/** Records the current state as a step in the history, unless nothing changed. */
	function commit() {
		const next = $state.snapshot(edit);

		if (JSON.stringify(next) === JSON.stringify(committed)) {
			return;
		}

		past = [...past, committed].slice(-MAX_HISTORY);
		future = [];
		committed = next;
	}

	function restore(state: EditorState) {
		committed = state;
		edit = structuredClone(state);
	}

	function undo() {
		const previous = past.at(-1);

		if (!previous) {
			return;
		}

		future = [committed, ...future];
		past = past.slice(0, -1);
		restore(previous);
	}

	function redo() {
		const [next, ...rest] = future;

		if (!next) {
			return;
		}

		past = [...past, committed];
		future = rest;
		restore(next);
	}

	function reset() {
		edit = initialState();
		commit();
	}

	function rotate(by: 90 | -90) {
		edit.rotation = ((((edit.rotation + by) % 360) + 360) % 360) as Rotation;
		// The image changed shape; start the selection over.
		edit.area = fullArea();
		commit();
	}

	function flip(axis: 'flipHorizontal' | 'flipVertical') {
		edit[axis] = !edit[axis];
		commit();
	}

	function chooseAspect(key: string) {
		edit.aspect = key;
		edit.area = fullArea();
		commit();
	}

	function toggleResize(enabled: boolean) {
		edit.resize = { enabled, width: cropWidth };
		commit();
	}

	function scaleTo(percent: number) {
		edit.resize = { enabled: true, width: Math.max(1, Math.round((cropWidth * percent) / 100)) };
		commit();
	}

	/** Typing a height sets the matching width; the height itself follows from the selection. */
	function setResizeHeight(value: number) {
		edit.resize.width = Math.max(1, Math.round((value * edit.area.width) / edit.area.height));
	}

	function setAdjustment(key: keyof Adjustments, value: number) {
		edit.adjustments[key] = value;
		commit();
	}

	function choosePreset(adjustments: Adjustments) {
		edit.adjustments = { ...adjustments };
		commit();
	}

	function chooseFormat(format: string) {
		edit.format = format as OutputFormat;
		commit();
	}

	function handleKeydown(event: KeyboardEvent) {
		const target = event.target;

		// Leave undo in text fields to the browser.
		if (target instanceof HTMLInputElement && target.type !== 'checkbox') {
			return;
		}

		if (!(event.ctrlKey || event.metaKey)) {
			return;
		}

		const key = event.key.toLowerCase();

		if (key === 'z' && !event.shiftKey) {
			event.preventDefault();
			undo();
		} else if ((key === 'z' && event.shiftKey) || key === 'y') {
			event.preventDefault();
			redo();
		}
	}

	/** Holding the compare button (or Space/Enter on it) shows the colors of the original. */
	function compareKey(event: KeyboardEvent, down: boolean) {
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();

			if (!event.repeat) {
				comparing = down;
			}
		}
	}

	/**
	 * Draws the rotated and flipped image, in the same order the server applies the edits (rotate,
	 * then flip, then crop). With `region` only that part is drawn. Runs again whenever an edit
	 * changes.
	 */
	function draw(region: Cropper.Area | null): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			const { width, height } = size;
			const view = region ?? { x: 0, y: 0, width, height };
			const scale = Math.min(1, PREVIEW_SIZE / Math.max(view.width, view.height));
			const context = canvas.getContext('2d');

			canvas.width = Math.max(1, Math.round(view.width * scale));
			canvas.height = Math.max(1, Math.round(view.height * scale));

			if (!context) {
				return;
			}

			context.translate(-view.x * scale, -view.y * scale);
			context.translate((width * scale) / 2, (height * scale) / 2);
			context.scale(edit.flipHorizontal ? -1 : 1, edit.flipVertical ? -1 : 1);
			context.rotate((edit.rotation * Math.PI) / 180);
			context.drawImage(
				image,
				(-image.naturalWidth * scale) / 2,
				(-image.naturalHeight * scale) / 2,
				image.naturalWidth * scale,
				image.naturalHeight * scale
			);
		};
	}

	async function apply() {
		failure = '';

		const { area } = edit;
		const cropped =
			area.x > 0.5 ||
			area.y > 0.5 ||
			Math.abs(area.width - size.width) > 0.5 ||
			Math.abs(area.height - size.height) > 0.5;

		try {
			await editImage({
				id: fileId,
				edits: {
					rotate: edit.rotation,
					flipHorizontal: edit.flipHorizontal,
					flipVertical: edit.flipVertical,
					crop: cropped ? $state.snapshot(area) : undefined,
					resize: edit.resize.enabled
						? { width: edit.resize.width, height: resizeHeight }
						: undefined,
					adjustments: isNeutral(edit.adjustments) ? undefined : $state.snapshot(edit.adjustments),
					output: { format: edit.format, quality: edit.quality }
				}
			});
			await refreshAll();
			toast.success('Image saved');
			onSaved();
		} catch (error) {
			failure =
				(error as { body?: { message?: string } })?.body?.message ??
				'The image could not be saved.';
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if failure}
	<div
		role="alert"
		class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
	>
		{failure}
	</div>
{/if}

<div class="grid gap-6 md:grid-cols-[1fr_18rem]">
	<div class="flex min-w-0 flex-col gap-2">
		<div class="flex items-center gap-1">
			<Button.Root
				variant="ghost"
				size="icon"
				aria-label="Undo"
				title="Undo (Ctrl+Z)"
				disabled={!past.length}
				onclick={undo}
			>
				<Icon.Root icon="lucide:undo-2" />
			</Button.Root>
			<Button.Root
				variant="ghost"
				size="icon"
				aria-label="Redo"
				title="Redo (Ctrl+Shift+Z)"
				disabled={!future.length}
				onclick={redo}
			>
				<Icon.Root icon="lucide:redo-2" />
			</Button.Root>

			<span class="mx-1 h-5 w-px bg-zinc-200" aria-hidden="true"></span>

			<Button.Root
				variant="ghost"
				aria-pressed={comparing}
				title="Hold to see the original colors"
				disabled={isNeutral(edit.adjustments)}
				onpointerdown={() => (comparing = true)}
				onpointerup={() => (comparing = false)}
				onpointerleave={() => (comparing = false)}
				onpointercancel={() => (comparing = false)}
				onkeydown={(event: KeyboardEvent) => compareKey(event, true)}
				onkeyup={(event: KeyboardEvent) => compareKey(event, false)}
				onblur={() => (comparing = false)}
			>
				<Icon.Root icon="lucide:split-square-horizontal" />
				Compare
			</Button.Root>

			<span
				class={['ml-auto text-xs tabular-nums', tooLarge ? 'text-red-600' : 'text-zinc-500']}
				aria-live="polite"
			>
				{outputWidth} × {outputHeight} px
			</span>
		</div>

		<div class="relative flex min-h-64 items-center justify-center rounded-lg bg-zinc-100 p-4">
			{#if tab === 'crop'}
				<Cropper.Root
					width={size.width}
					height={size.height}
					bind:area={edit.area}
					aspect={aspectRatio(edit.aspect)}
					maxHeight="60svh"
					oncommit={commit}
				>
					<canvas {@attach draw(null)} class="block size-full" style:filter></canvas>
				</Cropper.Root>
			{:else}
				<!-- Outside the crop tab, the preview shows the result: only the selected area. -->
				<canvas
					{@attach draw(edit.area)}
					class="block h-auto max-h-[60svh] w-auto max-w-full rounded-sm shadow-sm"
					style:filter
				></canvas>
			{/if}

			{#if comparing}
				<span
					class="absolute top-3 left-3 rounded-md bg-zinc-900/80 px-2 py-1 text-xs font-medium text-white"
				>
					Original
				</span>
			{/if}
		</div>
	</div>

	<div class="flex flex-col gap-5 text-sm">
		<Segmented.Root
			value={tab}
			onValueChange={(value) => (tab = value as Tab)}
			aria-label="Editing tools"
			class="w-full"
		>
			<Segmented.Item value="crop" class="flex-1">Crop</Segmented.Item>
			<Segmented.Item value="adjust" class="flex-1">Adjust</Segmented.Item>
			<Segmented.Item value="filters" class="flex-1">Filters</Segmented.Item>
			<Segmented.Item value="export" class="flex-1">Export</Segmented.Item>
		</Segmented.Root>

		{#if tab === 'crop'}
			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 font-medium text-zinc-900">Aspect ratio</legend>
				<div class="grid grid-cols-4 gap-1">
					{#each aspects as option (option.key)}
						<Button.Root
							variant={edit.aspect === option.key ? 'primary' : 'secondary'}
							class="px-0 text-xs"
							aria-pressed={edit.aspect === option.key}
							onclick={() => chooseAspect(option.key)}
						>
							{option.label}
						</Button.Root>
					{/each}
				</div>
				<p class="text-xs text-zinc-500">
					Selection {cropWidth} × {cropHeight} px · drag the corners or use the arrow keys
				</p>
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 font-medium text-zinc-900">Rotate & flip</legend>
				<div class="grid grid-cols-4 gap-1">
					<Button.Root
						variant="secondary"
						size="icon"
						class="w-full"
						aria-label="Rotate left"
						title="Rotate left"
						onclick={() => rotate(-90)}
					>
						<Icon.Root icon="lucide:rotate-ccw" />
					</Button.Root>
					<Button.Root
						variant="secondary"
						size="icon"
						class="w-full"
						aria-label="Rotate right"
						title="Rotate right"
						onclick={() => rotate(90)}
					>
						<Icon.Root icon="lucide:rotate-cw" />
					</Button.Root>
					<Button.Root
						variant={edit.flipHorizontal ? 'primary' : 'secondary'}
						size="icon"
						class="w-full"
						aria-label="Flip horizontally"
						title="Flip horizontally"
						aria-pressed={edit.flipHorizontal}
						onclick={() => flip('flipHorizontal')}
					>
						<Icon.Root icon="lucide:flip-horizontal-2" />
					</Button.Root>
					<Button.Root
						variant={edit.flipVertical ? 'primary' : 'secondary'}
						size="icon"
						class="w-full"
						aria-label="Flip vertically"
						title="Flip vertically"
						aria-pressed={edit.flipVertical}
						onclick={() => flip('flipVertical')}
					>
						<Icon.Root icon="lucide:flip-vertical-2" />
					</Button.Root>
				</div>
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 font-medium text-zinc-900">Resize</legend>
				<label class="flex items-center gap-2">
					<Checkbox.Root
						checked={edit.resize.enabled}
						onchange={(event) => toggleResize(event.currentTarget.checked)}
					/>
					Resize the result
				</label>

				{#if edit.resize.enabled}
					<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
						<Input.Root
							type="number"
							min="1"
							max={MAX_DIMENSION}
							aria-label="Width in pixels"
							aria-invalid={outputWidth > MAX_DIMENSION || undefined}
							value={edit.resize.width}
							oninput={(event) =>
								(edit.resize.width = Math.max(1, Number(event.currentTarget.value) || 1))}
							onchange={commit}
						/>
						<span class="text-zinc-400">×</span>
						<Input.Root
							type="number"
							min="1"
							max={MAX_DIMENSION}
							aria-label="Height in pixels"
							aria-invalid={outputHeight > MAX_DIMENSION || undefined}
							value={resizeHeight}
							oninput={(event) => setResizeHeight(Number(event.currentTarget.value) || 1)}
							onchange={commit}
						/>
					</div>
				{/if}

				<div class="grid grid-cols-3 gap-1">
					{#each scales as percent (percent)}
						<Button.Root variant="secondary" class="px-0 text-xs" onclick={() => scaleTo(percent)}>
							{percent}%
						</Button.Root>
					{/each}
				</div>

				{#if tooLarge}
					<p class="text-xs text-red-600">
						The result can be at most {MAX_DIMENSION} px wide and high.
					</p>
				{/if}
			</fieldset>
		{:else if tab === 'adjust'}
			<fieldset class="flex flex-col gap-1">
				<legend class="mb-2 font-medium text-zinc-900">Adjust</legend>

				{#each adjustmentControls as control (control.key)}
					{@const value = edit.adjustments[control.key]}
					{@const range = ADJUSTMENT_RANGES[control.key]}

					<div class="flex items-center justify-between gap-2 text-xs text-zinc-500">
						<span id="{uid}-{control.key}">{control.label}</span>
						<span class="flex items-center gap-1">
							<span class="tabular-nums">{value}{control.unit ?? ''}</span>
							<Button.Root
								variant="ghost"
								size="icon-sm"
								class={[value === NEUTRAL_ADJUSTMENTS[control.key] && 'invisible']}
								aria-label="Reset {control.label.toLowerCase()}"
								onclick={() => setAdjustment(control.key, NEUTRAL_ADJUSTMENTS[control.key])}
							>
								<Icon.Root icon="lucide:rotate-ccw" />
							</Button.Root>
						</span>
					</div>
					<Slider.Root
						bind:value={edit.adjustments[control.key]}
						min={range.min}
						max={range.max}
						aria-labelledby="{uid}-{control.key}"
						onValueCommit={commit}
					/>
				{/each}

				<Button.Root
					variant="ghost"
					class="mt-2 self-start"
					disabled={isNeutral(edit.adjustments)}
					onclick={() => choosePreset(NEUTRAL_ADJUSTMENTS)}
				>
					<Icon.Root icon="lucide:rotate-ccw" />
					Reset adjustments
				</Button.Root>
			</fieldset>
		{:else if tab === 'filters'}
			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 font-medium text-zinc-900">Filters</legend>
				<div class="grid grid-cols-3 gap-2">
					{#each FILTER_PRESETS as preset (preset.name)}
						<Swatch.Root
							src={image.src}
							filter={cssFilter(preset.adjustments)}
							selected={sameAdjustments(edit.adjustments, preset.adjustments)}
							onclick={() => choosePreset(preset.adjustments)}
						>
							{preset.name}
						</Swatch.Root>
					{/each}
				</div>
				<p class="text-xs text-zinc-500">Fine-tune a filter in the Adjust tab.</p>
			</fieldset>
		{:else}
			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 font-medium text-zinc-900">Format</legend>
				<Segmented.Root
					value={edit.format}
					onValueChange={chooseFormat}
					aria-label="Format"
					class="w-full"
				>
					{#each OUTPUT_FORMATS as format (format.value)}
						<Segmented.Item value={format.value} class="flex-1">{format.label}</Segmented.Item>
					{/each}
				</Segmented.Root>

				<ul class="flex flex-col gap-1 text-xs text-zinc-500">
					<li>Saved as <span class="font-mono text-zinc-900">{outputName}</span></li>
					{#if edit.format === 'image/jpeg' && originalFormat !== 'image/jpeg'}
						<li>JPEG has no transparency; transparent areas become solid.</li>
					{/if}
					{#if edit.format === 'image/webp'}
						<li>WebP is saved without loss of quality.</li>
					{/if}
					{#if mimeType.toLowerCase() === 'image/gif'}
						<li>Animated GIFs keep only their first frame.</li>
					{/if}
				</ul>
			</fieldset>

			{#if edit.format === 'image/jpeg'}
				<fieldset class="flex flex-col gap-1">
					<legend class="mb-2 font-medium text-zinc-900">Quality</legend>
					<div class="flex items-center justify-between text-xs text-zinc-500">
						<span id="{uid}-quality">Lower is smaller</span>
						<span class="tabular-nums">{edit.quality}</span>
					</div>
					<Slider.Root
						bind:value={edit.quality}
						min={1}
						max={100}
						aria-labelledby="{uid}-quality"
						onValueCommit={commit}
					/>
				</fieldset>
			{/if}
		{/if}
	</div>
</div>

<Dialog.Footer class="sm:justify-between">
	<Button.Root variant="ghost" disabled={pristine} onclick={reset}>
		<Icon.Root icon="lucide:list-restart" />
		Reset all
	</Button.Root>

	<div class="flex flex-col-reverse gap-2 sm:flex-row">
		<Dialog.Close>Cancel</Dialog.Close>
		<Button.Root disabled={pristine || tooLarge} onclick={apply}>Apply</Button.Root>
	</div>
</Dialog.Footer>
