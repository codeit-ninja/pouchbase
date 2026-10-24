import { describe, expect, it } from 'vitest';

import { describeStep, describeWarning } from './describe';

const field = {
	id: 'f-title',
	name: 'headline',
	type: 'integer' as const,
	required: true,
	unique: false,
	defaultValue: null,
	options: {},
	system: false,
	position: 1
};

describe('describeStep', () => {
	it('describes field changes in one line', () => {
		expect(
			describeStep({
				kind: 'field.update',
				severity: 'destructive',
				collectionId: 'c-posts',
				collection: 'posts',
				from: 'title',
				field,
				changes: ['name', 'type', 'required']
			})
		).toBe(
			'Field posts.title: rename to headline; change the type to integer (its data is lost); change required'
		);
	});

	it('describes settings with their values', () => {
		expect(
			describeStep({
				kind: 'setting.set',
				severity: 'safe',
				key: 'mail_sender_name',
				from: null,
				to: 'Shop'
			})
		).toBe('Set the mail sender name from empty to "Shop"');
	});

	it('describes plugin updates', () => {
		expect(
			describeStep({
				kind: 'plugin.install',
				severity: 'safe',
				from: '1.1.0',
				plugin: {
					id: 'acme/maps',
					name: 'Maps',
					version: '1.2.0',
					apiVersion: 1,
					integrity: '',
					registryUrl: ''
				}
			})
		).toBe('Update plugin Maps from 1.1.0 to 1.2.0');
	});
});

describe('describeWarning', () => {
	it('names the provider', () => {
		expect(describeWarning({ kind: 'oauth.secret', provider: 'github', label: 'GitHub' })).toBe(
			'Sign-in with GitHub needs its client secret on the target; it stays off until then.'
		);
	});

	it('falls back to the provider id in plans without labels', () => {
		expect(describeWarning({ kind: 'oauth.secret', provider: 'github' })).toBe(
			'Sign-in with github needs its client secret on the target; it stays off until then.'
		);
	});

	it('names the plugin a provider needs', () => {
		expect(
			describeWarning({
				kind: 'oauth.plugin',
				provider: 'gitlab',
				label: 'GitLab',
				pluginId: 'auth-gitlab'
			})
		).toBe('Sign-in with GitLab needs the plugin auth-gitlab on the target; it is left out.');
	});
});
