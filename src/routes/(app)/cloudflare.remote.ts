import type { CloudflarePlan } from '#lib/cloudflare/limits.js';
import type {
	CloudflareResources,
	LimitTotals,
	SectionResult,
	UsageSeries,
	WorkerInfo
} from '#lib/cloudflare/types.js';

import { error } from '@sveltejs/kit';
import { z } from 'zod';

import { form, getRequestEvent, query } from '$app/server';

import { USAGE_RANGES } from '#lib/cloudflare/limits.js';
import { cloudflarePlanSchema } from '#lib/schemas/cloudflare.js';

/**
 * Data for the Cloudflare overview on the dashboard. Each section has its own query, so one that
 * can't load (a missing token permission, for example) never takes the others down with it.
 */

function requireUser() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		error(401, 'Not logged in');
	}

	return locals;
}

const UNAVAILABLE: SectionResult<never> = {
	ok: false,
	reason: 'unavailable',
	message: 'This installation does not run on Cloudflare.'
};

function forbidden(permission: string): SectionResult<never> {
	return {
		ok: false,
		reason: 'forbidden',
		permission,
		message: `The API token is not allowed to read this. Add the "${permission}" permission to the token in the Cloudflare dashboard and update the CLOUDFLARE_API_TOKEN secret.`
	};
}

/** Whether the installation runs on Cloudflare; the overview is hidden otherwise. */
export const getCloudflareAvailable = query(async () => {
	const { services } = requireUser();

	const result = await services.cloudflare().available();

	return result.isOk() && result.value;
});

export const getCloudflareResources = query(
	async (): Promise<SectionResult<CloudflareResources>> => {
		const { services } = requireUser();

		const result = await services.cloudflare().resources();

		if (result.isErr()) {
			if (result.error.code === 14003) {
				return UNAVAILABLE;
			}

			error(500, result.error.message);
		}

		return { ok: true, data: result.value };
	}
);

export const getCloudflareWorker = query(async (): Promise<SectionResult<WorkerInfo | null>> => {
	const { services } = requireUser();

	const result = await services.cloudflare().worker();

	if (result.isErr()) {
		if (result.error.code === 14003) {
			return UNAVAILABLE;
		}

		if (result.error.code === 14002) {
			return forbidden('Workers Scripts: Read');
		}

		error(500, result.error.message);
	}

	return { ok: true, data: result.value };
});

export const getCloudflareUsage = query(
	z.enum(USAGE_RANGES),
	async (range): Promise<SectionResult<UsageSeries>> => {
		const { services } = requireUser();

		const result = await services.cloudflare().usage(range);

		if (result.isErr()) {
			if (result.error.code === 14003) {
				return UNAVAILABLE;
			}

			if (result.error.code === 14011) {
				return forbidden('Account Analytics: Read');
			}

			error(500, result.error.message);
		}

		return { ok: true, data: result.value };
	}
);

export const getCloudflareLimits = query(async (): Promise<SectionResult<LimitTotals>> => {
	const { services } = requireUser();

	const result = await services.cloudflare().limitTotals();

	if (result.isErr()) {
		if (result.error.code === 14003) {
			return UNAVAILABLE;
		}

		if (result.error.code === 14011) {
			return forbidden('Account Analytics: Read');
		}

		error(500, result.error.message);
	}

	return { ok: true, data: result.value };
});

export const getCloudflarePlan = query(async (): Promise<CloudflarePlan> => {
	const { services } = requireUser();

	const result = await services.cloudflare().plan();

	if (result.isErr()) {
		error(500, result.error.message);
	}

	return result.value;
});

export const updateCloudflarePlan = form(cloudflarePlanSchema, async (data) => {
	const { services } = requireUser();

	const result = await services.cloudflare().setPlan(data.plan);

	if (result.isErr()) {
		error(500, result.error.message);
	}

	void getCloudflarePlan().refresh();

	return { saved: true };
});
