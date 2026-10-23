/**
 * Email templates, shared by the Mail pages and the server: naming rules, the built-in templates
 * Pouchbase sends itself, and rendering a template with its variables into an email.
 */

import type { MailNode } from './document';
import type { MailStyle } from './layout';
import type { TemplateProblem, TemplateVariable, Variables } from './template';

import { parseDocument } from './document';
import { DEFAULT_MAIL_STYLE, htmlToText, visualLayout } from './layout';
import { missingVariables, parseTemplate, renderNodes, templateVariables } from './template';

export const MAIL_EDITORS = ['visual', 'html'] as const;

/** `visual`: a document of the visual editor, laid out with the template's style; `html`: a full HTML document. */
export type MailEditor = (typeof MAIL_EDITORS)[number];

/** Lowercase letters, digits and dashes, not at the ends; used by the API and the SDK. */
export const MAIL_TEMPLATE_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export const MAIL_TEMPLATE_NAME_MAX_LENGTH = 60;

/** Most characters the body of a template may have. */
export const MAX_TEMPLATE_BODY = 500_000;

/** Most recipients of one request to `/api/mail/send`; each gets an email of their own. */
export const MAX_RECIPIENTS = 50;

/** What a template is made of; enough to render it. */
export type MailTemplateContent = {
	subject: string;
	/** For `visual`: shown by mail clients next to the subject; may use variables. */
	preheader: string;
	editor: MailEditor;
	/** The editor's document as JSON (`visual`) or the whole HTML document (`html`), with variable tags. */
	body: string;
	/** For `visual`. */
	style: MailStyle;
};

export type RenderedMail = { subject: string; html: string; text: string };

export type SourceProblem = TemplateProblem & { source: 'subject' | 'body' };

export type CompiledTemplate =
	| { ok: true; variables: TemplateVariable[]; render: (values: Variables) => RenderedMail }
	| { ok: false; problems: SourceProblem[] };

/** The HTML document of a template before its variables are filled in. */
export function templateDocument(
	content: Pick<MailTemplateContent, 'editor' | 'body' | 'style' | 'preheader'>
) {
	return content.editor === 'visual'
		? visualLayout(parseDocument(content.body), content.style, content.preheader)
		: content.body;
}

/** Parses the subject and body once; `render` fills in the variables. */
export function compileTemplate(content: MailTemplateContent): CompiledTemplate {
	const subject = parseTemplate(content.subject);
	const body = parseTemplate(templateDocument(content));
	const problems: SourceProblem[] = [
		...(subject.ok
			? []
			: subject.problems.map((item) => ({ ...item, source: 'subject' as const }))),
		// Positions in a visual body point into the layout, so they are only shown for HTML.
		...(body.ok ? [] : body.problems.map((item) => ({ ...item, source: 'body' as const })))
	];

	if (!subject.ok || !body.ok) {
		return { ok: false, problems };
	}

	return {
		ok: true,
		variables: templateVariables(subject.nodes, body.nodes),
		render: (values) => {
			const html = renderNodes(body.nodes, values, 'html');

			return {
				subject: renderNodes(subject.nodes, values, 'text').replace(/\s+/g, ' ').trim(),
				html,
				text: htmlToText(html)
			};
		}
	};
}

export { missingVariables };

/** A template Pouchbase sends itself; it can be changed and reset, but not deleted or sent by the API. */
export type SystemTemplate = {
	name: string;
	description: string;
	content: MailTemplateContent;
	/** The variables Pouchbase passes, for the preview. */
	sampleData: Variables;
};

// Builders for the documents below.

const text = (value: string, marks?: MailNode['marks']): MailNode => ({
	type: 'text',
	text: value,
	...(marks ? { marks } : {})
});

const paragraph = (...content: MailNode[]): MailNode => ({ type: 'paragraph', content });

const heading = (level: number, value: string): MailNode => ({
	type: 'heading',
	attrs: { level },
	content: [text(value)]
});

const button = (href: string, label: string): MailNode => ({
	type: 'emailButton',
	attrs: { href, size: 'medium' },
	content: [text(label)]
});

const muted = (value: string) =>
	paragraph(text(value, [{ type: 'textStyle', attrs: { color: '#71717a', fontSize: '13px' } }]));

const doc = (...content: MailNode[]) => JSON.stringify({ type: 'doc', content });

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
	{
		name: 'verification',
		description: 'Sent to app users to confirm their email address.',
		content: {
			subject: 'Verify your email',
			preheader: 'Confirm your email address',
			editor: 'visual',
			body: doc(
				heading(1, 'Verify your email'),
				paragraph(text('Confirm your email address with the button below.')),
				button('{{url}}', 'Verify email'),
				muted(
					"If you didn't create an account, you can ignore this email. The link is valid for 3 days."
				)
			),
			style: DEFAULT_MAIL_STYLE
		},
		sampleData: {
			url: 'https://example.com/account/verify-email?token=…',
			email: 'ada@example.com'
		}
	},
	{
		name: 'password-reset',
		description: 'Sent to app users who asked to reset their password.',
		content: {
			subject: 'Reset your password',
			preheader: 'Choose a new password',
			editor: 'visual',
			body: doc(
				heading(1, 'Reset your password'),
				paragraph(
					text(
						'Someone asked to reset the password of your account. Choose a new password with the button below.'
					)
				),
				button('{{url}}', 'Reset password'),
				muted(
					"If you didn't ask for this, you can ignore this email; your password stays the same. The link is valid for 30 minutes."
				)
			),
			style: DEFAULT_MAIL_STYLE
		},
		sampleData: {
			url: 'https://example.com/account/reset-password?token=…',
			email: 'ada@example.com'
		}
	}
];

export type SystemTemplateName = 'verification' | 'password-reset';

export function systemTemplate(name: string) {
	return SYSTEM_TEMPLATES.find((template) => template.name === name) ?? null;
}

/** The content a new template starts with. */
export function starterTemplate(editor: MailEditor): MailTemplateContent {
	if (editor === 'html') {
		return {
			subject: 'Welcome, {{name}}',
			preheader: '',
			editor,
			body: `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
	body { margin: 0; padding: 32px 16px; background: #f4f4f5; font-family: sans-serif; color: #18181b; }
	.card { max-width: 560px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 8px; }
</style>
</head>
<body>
<div class="card">
	<h1>Welcome, {{name}}!</h1>
	<p>Thanks for signing up.</p>
	{{#if items}}
	<ul>
		{{#each items}}<li>{{this}}</li>{{/each}}
	</ul>
	{{/if}}
</div>
</body>
</html>
`,
			style: DEFAULT_MAIL_STYLE
		};
	}

	return {
		subject: 'Welcome, {{name}}',
		preheader: 'Everything you need to get started',
		editor,
		body: doc(
			heading(1, 'Welcome, {{name}}!'),
			paragraph(text('Thanks for signing up. Here is what you can do next:')),
			{
				type: 'bulletList',
				content: [
					{ type: 'listItem', content: [paragraph(text('{{#each steps}}'))] },
					{ type: 'listItem', content: [paragraph(text('{{this}}'))] },
					{ type: 'listItem', content: [paragraph(text('{{/each}}'))] }
				]
			},
			button('{{url | https://example.com}}', 'Get started')
		),
		style: DEFAULT_MAIL_STYLE
	};
}

/** Sample data a new template starts with, matching `starterTemplate`. */
export function starterSampleData(editor: MailEditor): Variables {
	return editor === 'html'
		? { name: 'Ada', items: ['Create a project', 'Invite your team'] }
		: { name: 'Ada', steps: ['Create a project', 'Invite your team'], url: 'https://example.com' };
}
