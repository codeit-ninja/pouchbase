/**
 * Plans in words, for the Environments page: one line per step and per warning.
 */

import type { FieldProperty, PlanStep, PlanWarning } from './diff';
import type { SnapshotSettingKey } from './snapshot';

import { OAUTH_PROVIDERS } from '#lib/auth/oauth-providers.js';
import { FIELD_TYPES } from '#lib/fields/field-types.js';

const SETTING_LABELS: Record<SnapshotSettingKey, string> = {
	auth_password_enabled: 'password sign-in',
	auth_password_signup: 'password sign-up',
	mail_provider: 'mail provider',
	mail_sender_name: 'mail sender name',
	mail_sender_address: 'mail sender address',
	smtp_host: 'SMTP host',
	smtp_port: 'SMTP port',
	smtp_security: 'SMTP encryption',
	smtp_username: 'SMTP username'
};

const FIELD_CHANGES: Record<Exclude<FieldProperty, 'name' | 'type'>, string> = {
	required: 'required',
	unique: 'unique',
	defaultValue: 'default value',
	options: 'options'
};

function provider(id: string) {
	return OAUTH_PROVIDERS[id as keyof typeof OAUTH_PROVIDERS]?.label ?? id;
}

function fieldType(type: string) {
	return FIELD_TYPES[type as keyof typeof FIELD_TYPES]?.label.toLowerCase() ?? type;
}

function value(text: string | null) {
	return text === null || text === '' ? 'empty' : `"${text}"`;
}

function fieldUpdate(step: PlanStep & { kind: 'field.update' }) {
	const parts: string[] = [];

	if (step.changes.includes('name')) {
		parts.push(`rename to ${step.field.name}`);
	}

	if (step.changes.includes('type')) {
		parts.push(`change the type to ${fieldType(step.field.type)} (its data is lost)`);
	}

	const others = step.changes.flatMap((change) =>
		change === 'name' || change === 'type' ? [] : [FIELD_CHANGES[change]]
	);

	if (others.length) {
		parts.push(`change ${others.join(', ')}`);
	}

	return `Field ${step.collection}.${step.from}: ${parts.join('; ')}`;
}

export function describeStep(step: PlanStep): string {
	switch (step.kind) {
		case 'index.drop':
			return `Drop ${step.unique ? 'unique ' : ''}index on ${step.collection} (${step.columns.join(', ')})`;
		case 'field.delete':
			return `Delete field ${step.collection}.${step.field} and its data`;
		case 'collection.delete':
			return `Delete collection ${step.collection} and its records`;
		case 'collection.rename':
			return `Rename collection ${step.from} to ${step.to}`;
		case 'collection.create':
			return `Create collection ${step.collection}`;
		case 'field.update':
			return fieldUpdate(step);
		case 'field.create':
			return `Add field ${step.collection}.${step.field.name} (${fieldType(step.field.type)})`;
		case 'collection.order':
			return `Reorder the fields of ${step.collection}`;
		case 'index.create':
			return `Add ${step.unique ? 'unique ' : ''}index on ${step.collection} (${step.columns.join(', ')})`;
		case 'collection.settings':
			return `Update the API rules and settings of ${step.collection}`;
		case 'function.delete':
			return `Delete function ${step.name}`;
		case 'function.create':
			return `Create function ${step.fn.name}`;
		case 'function.update':
			return step.changes.includes('code')
				? `Deploy the code of function ${step.fn.name}`
				: `Update function ${step.fn.name}`;
		case 'plugin.remove':
			return `Remove plugin ${step.name}`;
		case 'plugin.install':
			return step.from
				? `Update plugin ${step.plugin.name} from ${step.from} to ${step.plugin.version}`
				: `Install plugin ${step.plugin.name} ${step.plugin.version}`;
		case 'setting.set':
			return `Set the ${SETTING_LABELS[step.key]} from ${value(step.from)} to ${value(step.to)}`;
		case 'oauth.update':
			return `${step.enabled ? 'Turn on' : 'Update'} sign-in with ${provider(step.provider)}${step.enabled ? '' : ' (off)'}`;
	}
}

export function describeWarning(warning: PlanWarning): string {
	switch (warning.kind) {
		case 'function.secret':
			return `Function ${warning.function} uses the secret ${warning.secret}: add it on the target.`;
		case 'oauth.secret':
			return `Sign-in with ${provider(warning.provider)} needs its client secret on the target; it stays off until then.`;
		case 'setting.secret':
			return 'Mail is sent over SMTP: enter the SMTP password on the target.';
		case 'plugin.api':
			return `Plugin ${warning.plugin} needs plugin API ${warning.apiVersion}, which the target doesn't support; it is left out.`;
		case 'collection.system':
			return `The built-in collection ${warning.collection} is missing on the target; update the target first.`;
	}
}
