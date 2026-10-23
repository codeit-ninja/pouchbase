<script module lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	export type Props = Omit<HTMLInputAttributes, 'type' | 'value'> & {
		ref?: HTMLInputElement | null;
		/** Largest accepted file in bytes; bigger files are rejected before they are selected. */
		maxSize?: number;
		/** Text under the call to action; defaults to a summary of `accept` and `maxSize`. */
		hint?: string;
	};
</script>

<script lang="ts">
	import { formatFileSize } from '#lib/files.js';
	import * as Button from '../../button';
	import * as Icon from '../../icon';
	import * as Thumbnail from '../../thumbnail';

	let {
		ref = $bindable(null),
		files = $bindable(),
		id: idProp,
		accept,
		multiple = false,
		disabled = false,
		maxSize,
		hint,
		'aria-describedby': describedBy,
		class: className,
		...rest
	}: Props = $props();

	const fallbackId = $props.id();
	const id = $derived(idProp ?? fallbackId);

	const selected = $derived(files ? Array.from(files) : []);

	// Object URLs for image previews, revoked when the selection changes.
	const previews = $derived(
		selected.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null))
	);

	$effect(() => {
		const urls = previews;

		return () => {
			for (const url of urls) {
				if (url) {
					URL.revokeObjectURL(url);
				}
			}
		};
	});

	let dragging = $state(false);

	const dropLabel = $derived.by(() => {
		if (multiple) {
			return 'Drop to add';
		}

		return selected.length ? 'Drop to replace' : 'Drop to upload';
	});
	let rejection = $state<string | null>(null);

	// Set while this component dispatches its own events, so they aren't processed twice.
	let applying = false;

	const defaultHint = $derived.by(() => {
		const types = accept
			?.split(',')
			.map((rule) => rule.trim())
			.filter(Boolean)
			.join(', ');
		const size = maxSize ? `up to ${formatFileSize(maxSize)}` : '';

		return [types || (multiple ? 'Any files' : 'Any file'), size].filter(Boolean).join(' ');
	});

	function matchesAccept(file: File) {
		if (!accept) {
			return true;
		}

		const name = file.name.toLowerCase();
		const type = file.type.toLowerCase();

		return accept
			.split(',')
			.map((rule) => rule.trim().toLowerCase())
			.filter(Boolean)
			.some((rule) => {
				if (rule.startsWith('.')) {
					return name.endsWith(rule);
				}

				if (rule.endsWith('/*')) {
					return type.startsWith(rule.slice(0, -1));
				}

				return type === rule;
			});
	}

	/** Drops files that don't match `accept` or `maxSize` and explains why. */
	function filter(incoming: File[]) {
		const accepted: File[] = [];
		const problems: string[] = [];

		for (const file of incoming) {
			if (!matchesAccept(file)) {
				problems.push(`${file.name} is not an accepted file type.`);
			} else if (maxSize && file.size > maxSize) {
				problems.push(`${file.name} is larger than ${formatFileSize(maxSize)}.`);
			} else {
				accepted.push(file);
			}
		}

		rejection = problems.length ? problems.join(' ') : null;

		return accepted;
	}

	/** The selection after adding `accepted`: appended when `multiple`, otherwise replaced. */
	function merge(accepted: File[]) {
		if (!accepted.length) {
			return selected;
		}

		return multiple ? [...selected, ...accepted] : accepted.slice(0, 1);
	}

	function write(list: File[]) {
		if (!ref) {
			return;
		}

		const transfer = new DataTransfer();

		for (const file of list) {
			transfer.items.add(file);
		}

		ref.files = transfer.files;
	}

	/** Writes the selection to the input and notifies listeners (the form, `bind:files`). */
	function apply(list: File[]) {
		write(list);
		applying = true;

		try {
			ref?.dispatchEvent(new Event('input', { bubbles: true }));
			ref?.dispatchEvent(new Event('change', { bubbles: true }));
		} finally {
			applying = false;
		}
	}

	// Validates files picked through the dialog before the form reads them. A capture listener
	// runs before the form's own (bubbling) input listener.
	function handlePick() {
		if (applying || !ref?.files) {
			return;
		}

		write(merge(filter(Array.from(ref.files))));
	}

	function hasFiles(event: DragEvent) {
		return !!event.dataTransfer?.types.includes('Files');
	}

	function handleDragOver(event: DragEvent) {
		if (disabled || !hasFiles(event)) {
			return;
		}

		event.preventDefault();

		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}

		dragging = true;
	}

	function handleDragLeave(event: DragEvent) {
		const target = event.currentTarget as HTMLElement;

		if (!target.contains(event.relatedTarget as Node | null)) {
			dragging = false;
		}
	}

	function handleDrop(event: DragEvent) {
		dragging = false;

		if (disabled || !hasFiles(event)) {
			return;
		}

		event.preventDefault();

		const dropped = Array.from(event.dataTransfer?.files ?? []);
		const accepted = filter(multiple ? dropped : dropped.slice(0, 1));

		if (accepted.length) {
			apply(merge(accepted));
		}

		ref?.focus();
	}

	function remove(index: number) {
		rejection = null;
		apply(selected.filter((_, i) => i !== index));
		ref?.focus();
	}

	// A form reset clears the input without an event on it; sync the selection afterwards.
	$effect(() => {
		const form = ref?.form;

		if (!form) {
			return;
		}

		const handleReset = () => {
			rejection = null;
			queueMicrotask(() => (files = undefined));
		};

		form.addEventListener('reset', handleReset);

		return () => form.removeEventListener('reset', handleReset);
	});

	function iconFor(file: File) {
		const type = file.type;

		if (type.startsWith('image/')) {
			return 'lucide:file-image';
		}

		if (type.startsWith('video/')) {
			return 'lucide:file-video-camera';
		}

		if (type.startsWith('audio/')) {
			return 'lucide:file-audio';
		}

		if (type.startsWith('text/') || type === 'application/pdf' || type === 'application/json') {
			return 'lucide:file-text';
		}

		if (/zip|tar|gzip|compressed|rar|7z/.test(type)) {
			return 'lucide:file-archive';
		}

		return 'lucide:file';
	}
</script>

<!-- Dropping is a pointer shortcut; keyboard and screen reader users use the input itself. -->
<div
	role="presentation"
	ondragenter={handleDragOver}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	class={['flex flex-col gap-1.5', className]}
>
	<div
		data-dragging={dragging || undefined}
		class={[
			'relative overflow-hidden rounded-lg border bg-white transition-colors',
			'has-[input:focus-visible]:border-zinc-900 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-zinc-900/10',
			'has-[input[aria-invalid=true]]:border-red-500 has-[input[aria-invalid=true]]:ring-red-500/10',
			'has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50',
			'data-dragging:border-zinc-900 data-dragging:bg-zinc-50',
			selected.length ? 'border-zinc-300' : 'border-dashed border-zinc-300 hover:border-zinc-400'
		]}
	>
		<input
			bind:this={ref}
			bind:files
			type="file"
			{id}
			{accept}
			{multiple}
			{disabled}
			{...rest}
			aria-describedby={[describedBy, rejection && `${id}-rejection`].filter(Boolean).join(' ') ||
				undefined}
			oninputcapture={handlePick}
			class="sr-only"
		/>

		{#if selected.length === 0}
			<label
				for={id}
				class={[
					'flex flex-col items-center justify-center gap-2 px-6 py-8 text-center',
					disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-zinc-50'
				]}
			>
				<span
					class="flex size-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-xs [&_svg]:size-5"
				>
					<Icon.Root icon="lucide:upload" />
				</span>
				<span class="text-sm text-zinc-600">
					<strong class="font-medium text-zinc-900 underline underline-offset-4">
						Click to upload
					</strong>
					or drag and drop
				</span>
				<span class="text-xs text-zinc-500">{hint ?? defaultHint}</span>
			</label>
		{:else}
			<ul class="divide-y divide-zinc-200">
				{#each selected as file, index (`${index}:${file.name}:${file.size}:${file.lastModified}`)}
					<li class="flex items-center gap-3 p-3">
						<Thumbnail.Root src={previews[index]} alt="">
							<Icon.Root icon={iconFor(file)} />
						</Thumbnail.Root>

						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm font-medium text-zinc-900" title={file.name}>
								{file.name}
							</span>
							<span class="truncate text-xs text-zinc-500">
								{formatFileSize(file.size)}{file.type ? ` · ${file.type}` : ''}
							</span>
						</div>

						<Button.Root
							type="button"
							variant="ghost"
							size="icon"
							aria-label={`Remove ${file.name}`}
							{disabled}
							onclick={() => remove(index)}
						>
							<Icon.Root icon="lucide:x" />
						</Button.Root>
					</li>
				{/each}
			</ul>

			<div
				class="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500"
			>
				<span class="truncate">{hint ?? defaultHint}</span>
				<label
					for={id}
					class={[
						'shrink-0 font-medium text-zinc-900 underline-offset-4',
						disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:underline'
					]}
				>
					{multiple ? 'Add files' : 'Replace'}
				</label>
			</div>
		{/if}

		{#if dragging}
			<div
				class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-50/95 text-sm font-medium text-zinc-900 [&_svg]:size-5"
			>
				<Icon.Root icon="lucide:upload" />
				{dropLabel}
			</div>
		{/if}
	</div>

	{#if rejection}
		<p id={`${id}-rejection`} class="text-xs text-red-600" role="alert">{rejection}</p>
	{/if}
</div>
