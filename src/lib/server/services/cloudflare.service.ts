import type { CloudflarePlan, UsageRange } from '#lib/cloudflare/limits.js';
import type {
	CloudflareResources,
	LimitTotals,
	UsageSeries,
	WorkerInfo
} from '#lib/cloudflare/types.js';
import type { InsightsDriver, InsightsInput } from '../platform';
import type { ServiceError } from './base.service';

import { errAsync, fromPromise, okAsync, ResultAsync } from 'neverthrow';

import { CLOUDFLARE_PLANS } from '#lib/cloudflare/limits.js';

import { DATABASE_NAME, getDatabaseId } from '../db/query';
import { insights, PlatformError } from '../platform';
import { Service } from './base.service';

type Unsupported = ServiceError<14003, 'PLATFORM_UNSUPPORTED'>;

type AnalyticsError =
	ServiceError<14010, 'ANALYTICS_FAILED'> | ServiceError<14011, 'ANALYTICS_FORBIDDEN'>;

/** The API token is not allowed to read this (Cloudflare answers 401/403, or the GraphQL equivalent). */
function isForbidden(error: unknown) {
	return error instanceof PlatformError && (error.status === 401 || error.status === 403);
}

function isPlan(value: string | null): value is CloudflarePlan {
	return (CLOUDFLARE_PLANS as readonly string[]).includes(value ?? '');
}

/**
 * The Cloudflare overview on the dashboard: this installation's resources on the account, the
 * Worker's bindings, usage metrics and the plan whose limits apply. Only available when the app
 * runs on Cloudflare; every other method fails with `PLATFORM_UNSUPPORTED` on other platforms.
 */
export class CloudflareService extends Service {
	/** Whether this installation runs on Cloudflare, so the dashboard can show the overview. */
	available(): ResultAsync<boolean, never> {
		return okAsync(insights !== null);
	}

	/** This installation's databases and bucket, with their status, plus the account's other ones. */
	resources(): ResultAsync<
		CloudflareResources,
		| Unsupported
		| ServiceError<14000, 'RESOURCES_LOOKUP_FAILED'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
	> {
		return this.driver().andThen((driver) =>
			this.input().andThen((input) =>
				fromPromise(driver.resources(input), (error) =>
					this.error(14000, 'RESOURCES_LOOKUP_FAILED', error)
				)
			)
		);
	}

	/** The deployed Worker with its bindings, or `null` when it is not deployed (yet). */
	worker(): ResultAsync<
		WorkerInfo | null,
		| Unsupported
		| ServiceError<14001, 'WORKER_LOOKUP_FAILED'>
		| ServiceError<14002, 'WORKER_FORBIDDEN'>
	> {
		return this.driver().andThen((driver) =>
			fromPromise(driver.worker(), (error) =>
				isForbidden(error)
					? this.error(14002, 'WORKER_FORBIDDEN', error)
					: this.error(14001, 'WORKER_LOOKUP_FAILED', error)
			)
		);
	}

	/** Usage of this installation over the range, as time series for the charts. */
	usage(
		range: UsageRange
	): ResultAsync<
		UsageSeries,
		| Unsupported
		| AnalyticsError
		| ServiceError<14000, 'RESOURCES_LOOKUP_FAILED'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
	> {
		return this.driver().andThen((driver) =>
			this.input().andThen((input) =>
				fromPromise(driver.usage(range, input), (error) => this.analyticsError(error))
			)
		);
	}

	/** Account-wide usage in the current billing windows, to compare with the plan's limits. */
	limitTotals(): ResultAsync<LimitTotals, Unsupported | AnalyticsError> {
		return this.driver().andThen((driver) =>
			fromPromise(driver.limitTotals(), (error) => this.analyticsError(error))
		);
	}

	/** The Workers plan of the account, as chosen by the admin; defaults to Free. */
	plan(): ResultAsync<CloudflarePlan, ServiceError<5000, 'GET_SETTING_FAILED'>> {
		return this.services
			.settings()
			.get('cloudflare_plan')
			.map((value) => (isPlan(value) ? value : 'free'));
	}

	setPlan(plan: CloudflarePlan): ResultAsync<void, ServiceError<5001, 'SET_SETTING_FAILED'>> {
		return this.services.settings().set('cloudflare_plan', plan);
	}

	private driver(): ResultAsync<InsightsDriver, Unsupported> {
		return insights ? okAsync(insights) : errAsync(this.error(14003, 'PLATFORM_UNSUPPORTED'));
	}

	/** What the driver needs to tell this installation's resources from the rest of the account. */
	private input(): ResultAsync<
		InsightsInput,
		ServiceError<14000, 'RESOURCES_LOOKUP_FAILED'> | ServiceError<5000, 'GET_SETTING_FAILED'>
	> {
		return ResultAsync.combine([
			fromPromise(getDatabaseId(), (error) => this.error(14000, 'RESOURCES_LOOKUP_FAILED', error)),
			this.services.database().getApp(),
			this.services.settings().get('files_bucket_name')
		]).map(([systemId, appDatabase, bucketName]) => ({
			systemDatabase: systemId ? { id: systemId, name: DATABASE_NAME } : null,
			appDatabase,
			bucketName
		}));
	}

	private analyticsError(error: unknown): AnalyticsError {
		return isForbidden(error)
			? this.error(14011, 'ANALYTICS_FORBIDDEN', error)
			: this.error(14010, 'ANALYTICS_FAILED', error);
	}
}
