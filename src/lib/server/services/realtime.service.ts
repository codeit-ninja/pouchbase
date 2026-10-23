import type { ErrorOf, ServiceError } from './base.service';
import type { AuthService } from './auth.service';
import type { Collection } from './collections.service';
import type { Field } from './fields.service';
import type { ApiAccess, ApiRecord, RecordsService } from './records.service';
import type { AuthorizeCheck } from '../realtime/authorize';
import type {
	AccessContext,
	AuthorizeResult,
	RecordEvent,
	SessionResult,
	Subject
} from '../realtime/hub-core';

import { decodeJwt } from 'jose';
import { errAsync, fromPromise, okAsync, ResultAsync } from 'neverthrow';

import { FilterError } from '#lib/filter/filter.js';
import { apiActions } from '#lib/filter/rules.js';

import { batchDatabase } from '../db/query';
import { compileFilter, compileRule } from '../filter';
import { authorizationChecks } from '../realtime/authorize';
import { background } from '../platform/runtime';
import { publish } from '../realtime/broker';
import { Service } from './base.service';
import { apiRecord } from './records.service';

/** What the hub asks before it adds a subscription. */
export type SubscriptionRequest = {
	collection: string;
	subject: Subject;
	record: string | null;
	filter: string | null;
	fields: string[] | null;
	expand: string[] | null;
};

/** What the hub asks when its collection has events for subscribers. */
export type AuthorizeRequest = {
	collection: string;
	items: { event: RecordEvent; contexts: AccessContext[] }[];
};

type ForbiddenError = ServiceError<22002, 'SUBSCRIPTION_FORBIDDEN'>;
type InvalidSubscriptionError = ServiceError<22003, 'INVALID_SUBSCRIPTION'> & {
	data: { param: 'filter' | 'fields' | 'expand'; message: string };
};

type ExpandError = ErrorOf<ReturnType<RecordsService['apiExpand']>>;

/** What the records API checks for `subject`: nothing for admins (the dashboard). */
function apiAccess(subject: Subject): ApiAccess | undefined {
	if (subject.kind === 'admin') {
		return undefined;
	}

	return { auth: subject.kind === 'user' ? subject.auth : null };
}

/** The fields the records API reads and filters on: all but blobs. */
function readableFields(collectionFields: Field[]) {
	return collectionFields.filter((field) => field.type !== 'blob');
}

/**
 * Lets a publish finish after the response and logs a failure: saving a record never waits for,
 * or fails because of, its realtime event.
 */
export function inBackground(result: ResultAsync<void, unknown>) {
	background(
		Promise.resolve(
			result.mapErr((failure) => {
				console.error('[realtime] publish failed', failure);
			})
		)
	);
}

/**
 * Realtime events of records (see `src/lib/server/realtime/`). The hubs hold the sockets; this
 * service answers what they ask through `/internal/realtime/*`: who a socket is, whether it may
 * subscribe, and who may see an event.
 */
export class RealtimeService extends Service {
	/** Hands saved changes of one collection to its hub. */
	publish(events: RecordEvent[]): ResultAsync<void, ServiceError<22000, 'PUBLISH_FAILED'>> {
		if (!events.length) {
			return okAsync(undefined);
		}

		return fromPromise(publish(events), (error) => this.error(22000, 'PUBLISH_FAILED', error));
	}

	/**
	 * Who a socket is: the app user of `token`, else the dashboard admin of the session cookie
	 * (only passed on when the upgrade came from the same origin), else anonymous.
	 */
	session(
		token: string | null
	): ResultAsync<
		SessionResult,
		ErrorOf<ReturnType<AuthService['verifyToken']>> | ServiceError<11006, 'INVALID_TOKEN'>
	> {
		if (!token) {
			return okAsync({
				subject: this.ctx.locals.user ? { kind: 'admin' } : { kind: 'anonymous' },
				expiresAt: null
			});
		}

		return this.services
			.auth()
			.verifyToken(token)
			.andThen((user) => {
				let expiresAt: number | null;

				try {
					const { exp } = decodeJwt(token);
					expiresAt = exp ? exp * 1000 : null;
				} catch (error) {
					return errAsync(this.error(11006, 'INVALID_TOKEN', error));
				}

				return okAsync({ subject: { kind: 'user', auth: user } as Subject, expiresAt });
			});
	}

	/**
	 * Whether `subject` may subscribe: the collection exists, the API offers `view` for it and its
	 * view rule isn't locked or invalid (admins skip the rule), and the filter, fields and `expand`
	 * are valid (see `RecordsService.apiExpand`).
	 */
	checkSubscription(
		request: SubscriptionRequest
	): ResultAsync<
		void,
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<6006, 'COLLECTION_NOT_FOUND'>
		| ForbiddenError
		| InvalidSubscriptionError
		| ExpandError
	> {
		return this.services
			.collections()
			.requireWithFields(request.collection)
			.andThen(({ collection, fields: collectionFields }) => {
				const readable = readableFields(collectionFields);
				const auth = request.subject.kind === 'user' ? request.subject.auth : null;

				if (request.subject.kind !== 'admin') {
					if (!apiActions(collection).includes('view')) {
						return errAsync(this.error(22002, 'SUBSCRIPTION_FORBIDDEN'));
					}

					try {
						if (!compileRule(collection.settings.rules?.view, readable, { auth })) {
							return errAsync(this.error(22002, 'SUBSCRIPTION_FORBIDDEN'));
						}
					} catch {
						return errAsync(this.error(22002, 'SUBSCRIPTION_FORBIDDEN'));
					}
				}

				if (request.filter) {
					try {
						compileFilter(request.filter, readable, { auth });
					} catch (error) {
						return errAsync(this.invalid('filter', error));
					}
				}

				const unknown = request.fields?.find(
					(name) => !readable.some((field) => field.name === name)
				);

				if (unknown) {
					return errAsync(this.invalid('fields', new FilterError(`Unknown field \`${unknown}\``)));
				}

				if (!request.expand?.length) {
					return okAsync(undefined);
				}

				return this.services
					.records()
					.apiExpand(request.collection, [], request.expand, apiAccess(request.subject))
					.mapErr((error): ExpandError | ForbiddenError | InvalidSubscriptionError => {
						if (error.code === 8015) {
							return {
								...this.error(22003, 'INVALID_SUBSCRIPTION'),
								data: { param: 'expand', message: `Invalid expand: ${error.data.message}` }
							};
						}

						// The view rule of a related collection doesn't compile.
						return error.code === 8016 ? this.error(22002, 'SUBSCRIPTION_FORBIDDEN') : error;
					});
			});
	}

	/**
	 * Per event: the record as the API returns it and the contexts allowed to see it, or `null`
	 * when the collection or its table is gone. All checks run in one batch. For allowed contexts
	 * with `expand`, the record with its relations expanded as that subject may see them.
	 */
	authorize(
		request: AuthorizeRequest
	): ResultAsync<
		AuthorizeResult,
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
		| ServiceError<6001, 'GET_COLLECTION_FAILED'>
		| ServiceError<22004, 'AUTHORIZE_FAILED'>
	> {
		return this.services
			.collections()
			.requireWithFields(request.collection)
			.map((found): { collection: Collection; fields: Field[] } | null => found)
			.orElse((failure) => (failure.code === 6006 ? okAsync(null) : errAsync(failure)))
			.andThen((found) => {
				if (!found?.fields.length) {
					return okAsync({ results: request.items.map(() => null) });
				}

				const { collection, fields: collectionFields } = found;

				return this.services
					.database()
					.requireApp()
					.andThen((appDatabase) =>
						this.runChecks(appDatabase.id, collection, collectionFields, request)
					)
					.andThen((result) => this.expandAllowed(request, result));
			});
	}

	/**
	 * Adds `expanded` to the results: per allowed context with `expand`, the records of its events
	 * expanded in one go. A context whose `expand` no longer works (a relation was removed, or a
	 * view rule locked) gets no events, like a filter that no longer compiles.
	 */
	private expandAllowed(
		request: AuthorizeRequest,
		result: AuthorizeResult
	): ResultAsync<AuthorizeResult, ServiceError<22004, 'AUTHORIZE_FAILED'>> {
		const groups = new Map<
			string,
			{ subject: Subject; expand: string[]; items: { index: number; record: ApiRecord }[] }
		>();

		request.items.forEach(({ contexts }, index) => {
			const found = result.results[index];

			for (const context of contexts) {
				if (!found || !context.expand?.length || !found.allowed.includes(context.key)) {
					continue;
				}

				const group = groups.get(context.key) ?? {
					subject: context.subject,
					expand: context.expand,
					items: []
				};

				// A copy per context: what one subject may see of a relation, another may not.
				group.items.push({ index, record: { ...found.record } });
				groups.set(context.key, group);
			}
		});

		if (!groups.size) {
			return okAsync(result);
		}

		return ResultAsync.combine(
			[...groups].map(([key, group]) =>
				this.services
					.records()
					.apiExpand(
						request.collection,
						group.items.map((item) => item.record),
						group.expand,
						apiAccess(group.subject)
					)
					.map(() => true)
					.orElse((error) => {
						if (error.code === 8015 || error.code === 8016) {
							return okAsync(false);
						}

						return errAsync(this.error(22004, 'AUTHORIZE_FAILED', error));
					})
					.map((expanded) => ({ key, group, expanded }))
			)
		).map((expansions) => {
			const results = result.results.map((found) =>
				found ? { ...found, allowed: [...found.allowed], expanded: { ...found.expanded } } : null
			);

			for (const { key, group, expanded } of expansions) {
				for (const { index, record } of group.items) {
					const found = results[index]!;

					if (expanded) {
						found.expanded[key] = record;
					} else {
						found.allowed = found.allowed.filter((allowed) => allowed !== key);
					}
				}
			}

			return { results };
		});
	}

	private runChecks(
		databaseId: string,
		collection: Collection,
		collectionFields: Field[],
		request: AuthorizeRequest
	): ResultAsync<AuthorizeResult, ServiceError<22004, 'AUTHORIZE_FAILED'>> {
		const readable = readableFields(collectionFields);
		const key = collectionFields.find((field) => field.type === 'id')?.name ?? 'rowid';
		const viewOffered = apiActions(collection).includes('view');
		const checks: AuthorizeCheck[][] = request.items.map(({ event, contexts }) =>
			authorizationChecks({
				action: event.action,
				viewRule: collection.settings.rules?.view,
				viewOffered,
				readable,
				row: event.row,
				table: collection.name,
				key,
				keyParam: key === 'rowid' ? Number(event.id) : event.id,
				contexts
			})
		);
		const statements = checks.flat().flatMap((check) => (check.statement ? [check.statement] : []));

		return fromPromise(
			statements.length ? batchDatabase(databaseId, statements) : Promise.resolve([]),
			(error) => this.error(22004, 'AUTHORIZE_FAILED', error)
		).map((rows) => {
			let next = 0;

			return {
				results: request.items.map(({ event }, index) => ({
					record: apiRecord(collectionFields, event.row),
					allowed: checks[index]
						.filter((check) => (check.statement ? rows[next++]?.length : check.allowed))
						.map((check) => check.key)
				}))
			};
		});
	}

	private invalid(param: 'filter' | 'fields' | 'expand', error: unknown): InvalidSubscriptionError {
		return {
			...this.error(22003, 'INVALID_SUBSCRIPTION'),
			data: { param, message: error instanceof FilterError ? error.message : `Invalid ${param}` }
		};
	}
}
