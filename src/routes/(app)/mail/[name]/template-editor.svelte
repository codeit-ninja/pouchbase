<script lang="ts">
	import { untrack } from 'svelte';
	import * as Badge from '#lib/components/ui/badge/index.js';
	import * as Button from '#lib/components/ui/button/index.js';
	import * as Callout from '#lib/components/ui/callout/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as EmailPreview from '#lib/components/ui/email-preview/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Icon from '#lib/components/ui/icon/index.js';
	import * as Code from '#lib/components/ui/inputs/code/index.js';
	import * as EmailEditor from '#lib/components/ui/inputs/email-editor/index.js';
	import * as Input from '#lib/components/ui/inputs/input/index.js';
	import * as Segmented from '#lib/components/ui/segmented/index.js';
	import { toast } from '#lib/components/ui/toast/index.js';
	import type { MailStyle } from '#lib/mail/layout.js';
	import type { MailEditor, MailTemplateContent } from '#lib/mail/mail-templates.js';
	import { compileTemplate, missingVariables, templateDocument } from '#lib/mail/mail-templates.js';
	import { parseTemplate } from '#lib/mail/template.js';
	import type { Variables } from '#lib/mail/template.js';
	import { saveMailTemplate } from '../mail.remote';
	import type { MailTemplate } from '../types';
	import DeleteTemplateDialog from './delete-template-dialog.svelte';
	import ResetTemplateDialog from './reset-template-dialog.svelte';
	import SendTestDialog from './send-test-dialog.svelte';
	import SwitchEditorDialog from './switch-editor-dialog.svelte';
	import TemplateStyle from './template-style.svelte';
	import TemplateUsage from './template-usage.svelte';

	type Props = {
		template: MailTemplate;
		/** The sender the preview shows; `null` when mail isn't set up. */
		from: string | null;
		/** Where test emails go by default. */
		adminEmail: string;
	};

	let { template, from, adminEmail }: Props = $props();

	const dialogs = Dialog.getDialogs();

	function json(value: Variables) {
		return JSON.stringify(value, null, '\t');
	}

	// The editor starts from the saved template; the page creates it again after a save or reset.
	const saved = untrack(() => ({
		subject: template.content.subject,
		preheader: template.content.preheader,
		editor: template.content.editor,
		body: template.content.body,
		style: template.content.style,
		description: template.description,
		sampleData: json(template.sampleData)
	}));

	let subject = $state(saved.subject);
	let preheader = $state(saved.preheader);
	let editor = $state<MailEditor>(saved.editor);
	let body = $state(saved.body);
	let style = $state<MailStyle>(saved.style);
	let description = $state(saved.description);
	let sampleText = $state(saved.sampleData);

	let tab = $state('design');
	let width = $state<EmailPreview.Width>('desktop');
	let failure = $state<string | null>(null);

	const content = $derived<MailTemplateContent>({ subject, preheader, editor, body, style });

	// The body as the visual editor writes it, so loading it doesn't count as a change.
	let savedBody = $state(saved.body);

	const changed = $derived(
		subject !== saved.subject ||
			preheader !== saved.preheader ||
			editor !== saved.editor ||
			body !== savedBody ||
			JSON.stringify(style) !== JSON.stringify(saved.style) ||
			description !== saved.description ||
			sampleText !== saved.sampleData
	);

	const sample = $derived.by((): { ok: true; value: Variables } | { ok: false } => {
		try {
			const value: unknown = JSON.parse(sampleText || '{}');

			return value && typeof value === 'object' && !Array.isArray(value)
				? { ok: true, value: value as Variables }
				: { ok: false };
		} catch {
			return { ok: false };
		}
	});

	const sampleData = $derived(sample.ok ? sample.value : {});
	const compiled = $derived(compileTemplate(content));
	const missing = $derived(compiled.ok ? missingVariables(compiled.variables, sampleData) : []);
	const rendered = $derived(compiled.ok ? compiled.render(sampleData) : null);

	/** Names for "Insert variable": what the template uses and what the sample data has. */
	const variableNames = $derived([
		...new Set([
			...(compiled.ok ? compiled.variables.map((v) => v.name) : []),
			...Object.keys(sampleData)
		])
	]);

	const tabs = $derived([
		{ value: 'design', label: 'Design', icon: 'lucide:pencil-ruler' },
		{ value: 'preview', label: 'Preview', icon: 'lucide:eye' },
		{ value: 'data', label: 'Sample data', icon: 'lucide:braces' },
		...(template.system ? [] : [{ value: 'usage', label: 'Usage', icon: 'lucide:code' }])
	]);

	function errorMessage(error: unknown): string {
		const body = (error as { body?: { message?: unknown } } | null)?.body;

		if (typeof body?.message === 'string') {
			return body.message;
		}

		return error instanceof Error ? error.message : 'Something went wrong';
	}

	function discard() {
		subject = saved.subject;
		preheader = saved.preheader;
		editor = saved.editor;
		body = savedBody;
		style = saved.style;
		description = saved.description;
		sampleText = saved.sampleData;
		failure = null;
	}

	async function save() {
		failure = null;

		if (!sample.ok) {
			failure = 'The sample data must be a JSON object';
			tab = 'data';

			return;
		}

		try {
			await saveMailTemplate({ name: template.name, description, ...content, sampleData });
			toast.success('Template saved');
		} catch (error) {
			failure = errorMessage(error);
		}
	}

	async function editAsHtml() {
		if (await dialogs.open(SwitchEditorDialog)) {
			body = templateDocument(content);
			editor = 'html';
			tab = 'design';
		}
	}

	function sendTest() {
		void dialogs.open(SendTestDialog, { content, sampleData, to: adminEmail });
	}

	function problemOf(source: string) {
		const parsed = parseTemplate(source);

		return parsed.ok ? null : parsed.problems[0].message;
	}

	const subjectProblem = $derived(problemOf(subject));
	const preheaderProblem = $derived(problemOf(preheader));

	function bodyDiagnostics(value: string) {
		const parsed = parseTemplate(value);

		return parsed.ok ? [] : parsed.problems;
	}
</script>

{#snippet preview()}
	<EmailPreview.Root
		html={rendered?.html ?? templateDocument(content)}
		subject={rendered?.subject ?? subject}
		from={from ?? undefined}
		{width}
		class="h-[44rem]"
	/>
{/snippet}

{#snippet widthToggle()}
	<Segmented.Root
		value={width}
		onValueChange={(next) => (width = next as EmailPreview.Width)}
		aria-label="Preview width"
	>
		<Segmented.Item value="desktop" aria-label="Desktop">
			<Icon.Root icon="lucide:monitor" />
		</Segmented.Item>
		<Segmented.Item value="mobile" aria-label="Phone">
			<Icon.Root icon="lucide:smartphone" />
		</Segmented.Item>
	</Segmented.Root>
{/snippet}

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-end gap-2">
		{#if changed}
			<Badge.Root variant="warning" class="mr-auto">Not saved</Badge.Root>
			<Button.Root variant="ghost" onclick={discard}>Discard changes</Button.Root>
		{/if}

		<Button.Root variant="secondary" disabled={!compiled.ok || !sample.ok} onclick={sendTest}>
			<Icon.Root icon="lucide:send" />
			Send test
		</Button.Root>

		<Button.Root disabled={!changed || !compiled.ok} onclick={save}>
			<Icon.Root icon="lucide:save" />
			Save
		</Button.Root>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger variant="ghost" size="icon" aria-label="Template actions">
				<Icon.Root icon="lucide:ellipsis" />
			</DropdownMenu.Trigger>

			<DropdownMenu.Content>
				{#if editor === 'visual'}
					<DropdownMenu.Item onSelect={editAsHtml}>
						<Icon.Root icon="lucide:code-xml" />
						Edit as HTML
					</DropdownMenu.Item>
				{/if}

				{#if template.system}
					<DropdownMenu.Item
						variant="danger"
						disabled={!template.customized}
						onSelect={() => void dialogs.open(ResetTemplateDialog, { name: template.name })}
					>
						<Icon.Root icon="lucide:rotate-ccw" />
						Reset to default
					</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item
						variant="danger"
						onSelect={() => void dialogs.open(DeleteTemplateDialog, { name: template.name })}
					>
						<Icon.Root icon="lucide:trash-2" />
						Delete
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	{#if failure}
		<Callout.Root variant="error">
			<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
			<Callout.Body>
				<Callout.Title>Not saved</Callout.Title>
				<Callout.Description>{failure}</Callout.Description>
			</Callout.Body>
		</Callout.Root>
	{/if}

	<Card.Root>
		<Card.Content class="grid gap-4 pt-6 md:grid-cols-2">
			<Field.Root>
				<Field.Label for="mail-subject">Subject</Field.Label>
				<Input.Root
					id="mail-subject"
					bind:value={subject}
					autocomplete="off"
					aria-invalid={!!subjectProblem}
					aria-describedby={subjectProblem ? 'mail-subject-problem' : undefined}
				/>
				{#if subjectProblem}
					<Field.Description id="mail-subject-problem" class="text-red-600">
						{subjectProblem}
					</Field.Description>
				{/if}
			</Field.Root>

			{#if editor === 'visual'}
				<Field.Root>
					<Field.Label for="mail-preheader">Preview text</Field.Label>
					<Input.Root
						id="mail-preheader"
						bind:value={preheader}
						autocomplete="off"
						placeholder="Shown next to the subject in the inbox"
						aria-invalid={!!preheaderProblem}
						aria-describedby={preheaderProblem ? 'mail-preheader-problem' : undefined}
					/>
					{#if preheaderProblem}
						<Field.Description id="mail-preheader-problem" class="text-red-600">
							{preheaderProblem}
						</Field.Description>
					{/if}
				</Field.Root>
			{/if}

			{#if !template.system}
				<Field.Root class="md:col-span-2">
					<Field.Label for="mail-description">Description</Field.Label>
					<Input.Root
						id="mail-description"
						bind:value={description}
						autocomplete="off"
						placeholder="What the email is for"
					/>
				</Field.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if !compiled.ok}
		<Callout.Root variant="error">
			<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
			<Callout.Body>
				<Callout.Title>Fix the variable tags</Callout.Title>
				<Callout.Description>
					<ul class="flex flex-col gap-1">
						{#each compiled.problems as problem, index (index)}
							<li>
								{problem.source === 'subject' ? 'Subject' : 'Email'}{editor === 'html' &&
								problem.source === 'body'
									? `, line ${problem.line}`
									: ''}: {problem.message}
							</li>
						{/each}
					</ul>
				</Callout.Description>
			</Callout.Body>
		</Callout.Root>
	{/if}

	<div class="flex flex-wrap items-center justify-between gap-2">
		<Segmented.Root value={tab} onValueChange={(next) => (tab = next)} aria-label="Template">
			{#each tabs as item (item.value)}
				<Segmented.Item value={item.value}>
					<Icon.Root icon={item.icon} />
					{item.label}
				</Segmented.Item>
			{/each}
		</Segmented.Root>

		{#if tab === 'preview'}
			{@render widthToggle()}
		{/if}
	</div>

	{#if tab === 'design'}
		{#if editor === 'visual'}
			<div class="overflow-clip rounded-xl border border-zinc-200 bg-white">
				<EmailEditor.Root
					bind:value={body}
					mailStyle={style}
					variables={variableNames}
					onReady={(value) => {
						if (body === saved.body) {
							savedBody = value;
							body = value;
						}
					}}
				>
					<EmailEditor.Toolbar class="sticky top-0 z-10" />

					<div class="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
						<EmailEditor.Canvas class="min-h-[40rem]" />
						<EmailEditor.Inspector class="border-t border-zinc-200 lg:border-t-0 lg:border-l">
							{#snippet fallback()}
								<TemplateStyle bind:style />
							{/snippet}
						</EmailEditor.Inspector>
					</div>
				</EmailEditor.Root>
			</div>

			<p class="text-sm text-zinc-500">
				Variables: <code>{'{{name}}'}</code>, a fallback with <code>{'{{name | there}}'}</code>, and
				blocks with <code>{'{{#if paid}}…{{else}}…{{/if}}'}</code> and
				<code>{'{{#each items}}…{{/each}}'}</code>. Put a block tag in a paragraph or list item of
				its own to repeat or hide everything up to its closing tag.
			</p>
		{:else}
			<div class="grid items-start gap-4 xl:grid-cols-2">
				<Code.Root
					bind:value={body}
					language="html"
					diagnostics={bodyDiagnostics}
					aria-label="HTML of the email"
					class="h-[44rem]"
				/>
				<div class="flex flex-col gap-2">
					<div class="flex justify-end">{@render widthToggle()}</div>
					{@render preview()}
				</div>
			</div>
		{/if}
	{:else if tab === 'preview'}
		{#if !sample.ok}
			<Callout.Root variant="warning">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>The sample data isn't a valid JSON object.</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{:else if missing.length}
			<Callout.Root variant="warning">
				<Callout.Icon><Icon.Root icon="lucide:circle-alert" /></Callout.Icon>
				<Callout.Body>
					<Callout.Description>
						Required variables missing from the sample data: {missing.join(', ')}. Sending without
						them fails.
					</Callout.Description>
				</Callout.Body>
			</Callout.Root>
		{/if}

		{@render preview()}
	{:else if tab === 'data'}
		<Card.Root>
			<Card.Content class="flex flex-col gap-4 pt-6">
				<Field.Root>
					<Field.Label id="mail-sample-label">Sample data</Field.Label>
					<Code.Root
						bind:value={sampleText}
						language="json"
						lineNumbers={false}
						aria-labelledby="mail-sample-label"
						aria-invalid={!sample.ok}
						class="h-72"
					/>
					<Field.Description>
						{#if template.system}
							The variables Pouchbase passes when it sends this email, for the preview.
						{:else}
							A JSON object with example variables, for the preview and test emails.
						{/if}
					</Field.Description>
				</Field.Root>

				{#if compiled.ok && compiled.variables.length}
					<div class="flex flex-col gap-2">
						<span class="text-sm font-medium text-zinc-900">Variables in this template</span>
						<div class="flex flex-wrap gap-2">
							{#each compiled.variables as variable (variable.name)}
								<Badge.Root variant={missing.includes(variable.name) ? 'danger' : 'outline'}>
									<span class="font-mono">{variable.name}</span>
									{variable.required ? 'required' : 'optional'}
								</Badge.Root>
							{/each}
						</div>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content class="pt-6">
				<TemplateUsage name={template.name} {sampleData} />
			</Card.Content>
		</Card.Root>
	{/if}
</div>
