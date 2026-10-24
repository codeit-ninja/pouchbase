import type { ProviderJoinRow } from './oauth-settings';

import { describe, expect, it } from 'vitest';

import { embeddedPlugin } from './plugins/embedded';
import { toProviderDetails, toProviderSettings } from './oauth-settings';

const updatedAt = new Date(0);

function row(overrides: Partial<ProviderJoinRow> = {}): ProviderJoinRow {
	return {
		provider: {
			provider: 'google',
			pluginId: 'auth-google',
			label: 'Google',
			consoleUrl: 'https://console.cloud.google.com/apis/credentials',
			icon: 'ui/google.svg',
			authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
			tokenUrl: 'https://oauth2.googleapis.com/token',
			scopes: ['openid', 'email', 'profile'],
			pkce: true,
			updatedAt
		},
		credentials: null,
		installedVersion: null,
		...overrides
	};
}

describe('toProviderSettings', () => {
	it('uses the plugin for the label and the logo, versioned by the built-in plugin', () => {
		const version = embeddedPlugin('auth-google')!.manifest.version;

		expect(toProviderSettings(row())).toEqual({
			provider: 'google',
			pluginId: 'auth-google',
			label: 'Google',
			consoleUrl: 'https://console.cloud.google.com/apis/credentials',
			iconUrl: `/api/plugins/auth-google/assets/ui/google.svg?v=${version}`,
			enabled: false,
			clientId: '',
			hasSecret: false
		});
	});

	it('versions the logo by the installed plugin and reads the stored credentials', () => {
		const settings = toProviderSettings(
			row({
				installedVersion: '2.0.0',
				credentials: {
					provider: 'google',
					enabled: true,
					clientId: 'id',
					clientSecret: 'secret',
					updatedAt
				}
			})
		);

		expect(settings).toMatchObject({
			iconUrl: '/api/plugins/auth-google/assets/ui/google.svg?v=2.0.0',
			enabled: true,
			clientId: 'id',
			hasSecret: true
		});
		expect(settings).not.toHaveProperty('clientSecret');
	});

	it('has no logo without an icon or a plugin version', () => {
		expect(toProviderSettings(row({ provider: { ...row().provider, icon: null } })).iconUrl).toBe(
			null
		);
		expect(
			toProviderSettings(row({ provider: { ...row().provider, pluginId: 'auth-gone' } })).iconUrl
		).toBe(null);
	});
});

describe('toProviderDetails', () => {
	it('carries the OAuth config and the credentials', () => {
		expect(
			toProviderDetails(
				row({
					credentials: {
						provider: 'google',
						enabled: true,
						clientId: 'id',
						clientSecret: 'secret',
						updatedAt
					}
				})
			)
		).toEqual({
			provider: 'google',
			pluginId: 'auth-google',
			label: 'Google',
			config: {
				authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
				tokenUrl: 'https://oauth2.googleapis.com/token',
				scopes: ['openid', 'email', 'profile'],
				pkce: true
			},
			credentials: { enabled: true, clientId: 'id', clientSecret: 'secret' }
		});
	});

	it('is disabled without stored credentials', () => {
		expect(toProviderDetails(row()).credentials).toEqual({
			enabled: false,
			clientId: '',
			clientSecret: ''
		});
	});
});
