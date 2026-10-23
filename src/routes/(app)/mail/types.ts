import type { getMailTemplate, getMailTemplates } from './mail.remote';

export type MailTemplateInfo = Awaited<ReturnType<typeof getMailTemplates>>[number];

export type MailTemplate = Awaited<ReturnType<typeof getMailTemplate>>;
