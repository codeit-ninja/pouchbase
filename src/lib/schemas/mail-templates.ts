import { z } from 'zod';

import { LOGO_ALIGNMENTS, MAIL_FONTS } from '#lib/mail/layout.js';
import {
	MAIL_EDITORS,
	MAIL_TEMPLATE_NAME_MAX_LENGTH,
	MAIL_TEMPLATE_NAME_PATTERN,
	MAX_RECIPIENTS,
	MAX_TEMPLATE_BODY
} from '#lib/mail/mail-templates.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email address'));

const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a color like #18181b');

const description = z
	.string()
	.trim()
	.max(500, 'Description must be at most 500 characters')
	.default('');

export const templateName = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, 'Enter a name')
	.max(
		MAIL_TEMPLATE_NAME_MAX_LENGTH,
		`Name must be at most ${MAIL_TEMPLATE_NAME_MAX_LENGTH} characters`
	)
	.regex(
		MAIL_TEMPLATE_NAME_PATTERN,
		'Use lowercase letters, digits and dashes, like welcome-email'
	);

/** Values for the variables; a JSON object. */
const variables = z.record(z.string(), z.unknown());

/** A new template (Mail page). */
export const createMailTemplateSchema = z.object({
	name: templateName,
	description,
	editor: z.enum(MAIL_EDITORS)
});

export const mailTemplateNameSchema = z.object({ name: z.string().min(1) });

export const mailStyleSchema = z.object({
	backgroundColor: color,
	contentColor: color,
	textColor: color,
	linkColor: color,
	buttonColor: color,
	buttonTextColor: color,
	font: z.enum(MAIL_FONTS),
	fontSize: z.number().int().min(12).max(20),
	logoUrl: z.string().trim().max(2000, 'URL must be at most 2000 characters'),
	logoHeight: z.number().int().min(16).max(120),
	logoAlign: z.enum(LOGO_ALIGNMENTS),
	width: z.number().int().min(320).max(800),
	padding: z.number().int().min(0).max(64),
	radius: z.number().int().min(0).max(32)
});

const content = {
	subject: z
		.string()
		.trim()
		.min(1, 'Enter a subject')
		.max(500, 'Subject must be at most 500 characters'),
	preheader: z.string().trim().max(500, 'Preview text must be at most 500 characters').default(''),
	editor: z.enum(MAIL_EDITORS),
	body: z
		.string()
		.min(1, 'The email is empty')
		.max(MAX_TEMPLATE_BODY, `The email must be at most ${MAX_TEMPLATE_BODY} characters`),
	style: mailStyleSchema
};

/** Everything the template editor saves. */
export const saveMailTemplateSchema = z.object({
	name: z.string().min(1),
	description,
	...content,
	sampleData: variables
});

/** Sends what is in the editor to an address, with the sample data. */
export const sendTestMailTemplateSchema = z.object({
	...content,
	sampleData: variables,
	to: email
});

/** Body of `POST /api/mail/send`. */
export const sendMailSchema = z.object({
	template: z.string().min(1, 'Name the template'),
	to: z
		.union([email, z.array(email)])
		.transform((to) => (Array.isArray(to) ? to : [to]))
		.pipe(
			z
				.array(z.string())
				.min(1, 'Name at least one recipient')
				.max(MAX_RECIPIENTS, `Send to at most ${MAX_RECIPIENTS} recipients at once`)
		),
	variables: variables.default({})
});
