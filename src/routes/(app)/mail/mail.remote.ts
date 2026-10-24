import type { FilesService, StoredFile } from '#lib/server/services/files.service.js';

import { error, invalid, redirect } from '@sveltejs/kit';
import { z } from 'zod';

import { command, form, getRequestEvent, query } from '$app/server';

import { fileUrl } from '#lib/files/files.js';
import { previewThumbnail } from '#lib/files/thumbnails.js';
import {
	createMailTemplateSchema,
	listMailImagesSchema,
	mailTemplateNameSchema,
	saveMailTemplateSchema,
	sendTestMailTemplateSchema,
	uploadMailImageSchema
} from '#lib/schemas/mail-templates.js';
import { mailSettingsSchema, testMailSchema } from '#lib/schemas/mail.js';

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

/** How many images the image picker shows. */
const MAIL_IMAGES_LIMIT = 60;

/**
 * An image in files as the email editor's picker shows it. `path` is relative: queries can't
 * read the request's URL, so the picker makes it absolute (emails are read elsewhere).
 */
function mailImage(file: StoredFile, thumb: string | null) {
	return {
		id: file.id,
		name: file.name,
		size: file.size,
		path: fileUrl(file.id),
		preview: fileUrl(file.id, { thumb })
	};
}

/** The size of the picker's thumbnails; `null` when thumbnails are off. Best effort. */
async function mailImageThumb(files: FilesService) {
	const settings = await files.thumbnailSettings();

	return settings.isOk() ? previewThumbnail(settings.value, 100) : null;
}

/** The newest images in files, for the email editor's image picker. */
export const listMailImages = query(listMailImagesSchema, async ({ search }) => {
	const files = requireUser().services.files();

	const result = await files.listImages(search, MAIL_IMAGES_LIMIT);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	const thumb = await mailImageThumb(files);

	return result.value.map((file) => mailImage(file, thumb));
});

/** Uploads an image to files from the email editor. */
export const uploadMailImage = form(uploadMailImageSchema, async (data, issue) => {
	const files = requireUser().services.files();

	const result = await files.create(data._image);

	if (result.isErr()) {
		if (result.error.code === 13001 || result.error.code === 13002) {
			invalid(
				issue._image(result.error.code === 13001 ? 'This image is too large' : 'This file is empty')
			);
		}

		error(500, result.error.message);
	}

	return mailImage(result.value, await mailImageThumb(files));
});

/** Every template: the built-in ones first, then the others by name. */
export const getMailTemplates = query(async () => {
	const { services } = requireUser();

	const result = await services.mailTemplates().list();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const getMailTemplate = query(z.string(), async (name) => {
	const { services } = requireUser();

	const result = await services.mailTemplates().get(name);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	if (!result.value) {
		error(404, 'Template not found');
	}

	return result.value;
});

/** Whether mail can be sent, and the sender the preview shows. */
export const getMailSender = query(async () => {
	const { services } = requireUser();

	const result = await services.mail().settings();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	const { provider, senderName, senderAddress } = result.value;

	return {
		enabled: provider !== 'none' && !!senderAddress,
		from: senderAddress ? (senderName ? `${senderName} <${senderAddress}>` : senderAddress) : null
	};
});

/** The mail settings. The SMTP password is never included. */
export const getMailSettings = query(async () => {
	const { services } = requireUser();

	const result = await services.mail().settings();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const updateMailSettings = form(mailSettingsSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.mail().update({
		provider: data.provider,
		senderName: data.senderName,
		senderAddress: data.senderAddress,
		smtpHost: data.smtpHost,
		smtpPort: data.smtpPort,
		smtpSecurity: data.smtpSecurity,
		smtpUsername: data.smtpUsername,
		smtpPassword: data._smtpPassword
	});

	if (result.isErr()) {
		if (result.error.code === 15000) {
			invalid(
				issue.provider(
					'Cloudflare Email Service needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN'
				)
			);
		}

		error(500, result.error.message);
	}

	void getMailSettings().refresh();
	void getMailSender().refresh();

	return { saved: true };
});

export const sendTestMail = form(testMailSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.mail().sendTest(data.to);

	if (result.isErr()) {
		if (result.error.code === 15001) {
			invalid('Save the mail settings with a sender address first');
		}

		if (result.error.code === 15004) {
			invalid(`Could not send the email: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	return { sent: true };
});

export const createMailTemplate = form(createMailTemplateSchema, async (data, issue) => {
	const { services } = requireUser();

	const result = await services.mailTemplates().create(data);

	if (result.isErr()) {
		if (result.error.code === 24002) {
			invalid(issue.name('A template with this name already exists'));
		}

		error(500, result.error.message);
	}

	void getMailTemplates().refresh();

	redirect(303, `/mail/${data.name}`);
});

/** Saves what is in the editor. */
export const saveMailTemplate = command(saveMailTemplateSchema, async (data) => {
	const { services } = requireUser();

	const { name, ...input } = data;
	const result = await services.mailTemplates().update(name, input);

	if (result.isErr()) {
		if (result.error.code === 24001) {
			error(404, 'Template not found');
		}

		if (result.error.code === 24005) {
			error(422, `Fix the variable tags first: ${result.error.data.problems[0].message}`);
		}

		error(500, result.error.message);
	}

	void getMailTemplates().refresh();
	void getMailTemplate(name).refresh();

	return { saved: true };
});

export const deleteMailTemplate = form(mailTemplateNameSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.mailTemplates().delete(data.name);

	if (result.isErr()) {
		if (result.error.code === 24001) {
			error(404, 'Template not found');
		}

		if (result.error.code === 24003) {
			invalid('Built-in templates can be reset, not deleted');
		}

		error(500, result.error.message);
	}

	void getMailTemplates().refresh();

	redirect(303, '/mail');
});

/** Puts a built-in template back to how Pouchbase ships it. */
export const resetMailTemplate = form(mailTemplateNameSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.mailTemplates().reset(data.name);

	if (result.isErr()) {
		if (result.error.code === 24001) {
			error(404, 'Template not found');
		}

		error(500, result.error.message);
	}

	void getMailTemplates().refresh();
	void getMailTemplate(data.name).refresh();

	return { reset: true };
});

/** Sends what is in the editor, saved or not, with the sample data. */
export const sendTestMailTemplate = command(sendTestMailTemplateSchema, async (data) => {
	const { services } = requireUser();

	const { to, sampleData, ...content } = data;
	const result = await services.mailTemplates().sendTest(content, to, sampleData);

	if (result.isErr()) {
		if (result.error.code === 24004) {
			error(422, `Add these variables to the sample data: ${result.error.data.missing.join(', ')}`);
		}

		if (result.error.code === 24005) {
			error(422, `Fix the variable tags first: ${result.error.data.problems[0].message}`);
		}

		if (result.error.code === 15001) {
			error(409, 'Set up sending email first');
		}

		if (result.error.code === 15004) {
			error(502, `Could not send the email: ${result.error.data.reason}`);
		}

		error(500, result.error.message);
	}

	return { sent: true };
});
