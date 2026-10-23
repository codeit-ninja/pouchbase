import { describe, expect, it } from 'vitest';

import { compareVersions } from './updates';

describe('compareVersions', () => {
	it('orders by major, minor and patch', () => {
		expect(compareVersions('0.5.0', '0.4.9')).toBeGreaterThan(0);
		expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
		expect(compareVersions('0.4.0', '0.4.1')).toBeLessThan(0);
		expect(compareVersions('0.4.0', 'v0.4.0')).toBe(0);
	});

	it('puts a release after its prereleases', () => {
		expect(compareVersions('0.5.0', '0.5.0-beta.1')).toBeGreaterThan(0);
		expect(compareVersions('0.5.0-beta.1', '0.5.0-beta.2')).toBeLessThan(0);
	});

	it('treats anything that is not a version as equal, so it is never offered as an update', () => {
		expect(compareVersions('latest', '0.4.0')).toBe(0);
	});
});
