import type { BackupsService } from './backups.service';
import type { ErrorOf, ServiceError } from './base.service';
import type { FieldChange } from './fields.service';
import type { Plan, PlanStep, PlanWarning } from '#lib/environments/diff.js';
import type { Environment } from '#lib/environments/snapshot.js';
import { deploymentSchema, remotePlanSchema, snapshotSchema } from '#lib/schemas/environments.js';
import type {
	Snapshot,
	SnapshotCollection,
	SnapshotField,
	SnapshotIndex
} from '#lib/schemas/environments.js';

import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync, ResultAsync } from 'neverthrow';
import { SUPPORTED_API_VERSIONS } from '@pouchbasejs/plugin-sdk';

import { POUCHBASE_INSTANCE } from '$app/env/private';
import { diff, planSeverity } from '#lib/environments/diff.js';
import {
	ENVIRONMENTS,
	SNAPSHOT_FORMAT,
	SNAPSHOT_SECRET_KEYS,
	SNAPSHOT_SETTING_KEYS,
	snapshotHash
} from '#lib/environments/snapshot.js';

import { generateToken, hashToken } from '../crypto';
import {
	backups,
	collections,
	deployments,
	deployTokens,
	fields,
	functions,
	functionVersions,
	plugins
} from '../db';
import { queryDatabase } from '../db/query';
import { Service } from './base.service';
import { uniqueIndexName } from './fields.service';

type SnapshotFailed = ServiceError<20000, 'SNAPSHOT_FAILED'>;
type TokensFailed = ServiceError<20001, 'DEPLOY_TOKENS_QUERY_FAILED'>;
type TokenNotFound = ServiceError<20002, 'DEPLOY_TOKEN_NOT_FOUND'>;
type DeploymentsFailed = ServiceError<20003, 'DEPLOYMENTS_QUERY_FAILED'>;
type TargetChanged = ServiceError<20004, 'TARGET_CHANGED'>;
type NotConfirmed = ServiceError<20005, 'DESTRUCTIVE_NOT_CONFIRMED'>;
type JobRunning = ServiceError<20006, 'JOB_RUNNING'>;
type StepsFailed = ServiceError<20007, 'STEPS_FAILED'>;
type RemoteNotLinked = ServiceError<20008, 'REMOTE_NOT_LINKED'>;
/** A request to the linked instance failed; `status` is 0 when it couldn't be reached. */
type RemoteFailed = ServiceError<20009, 'REMOTE_REQUEST_FAILED'> & {
	data: { status: number; message: string };
};
type SourceChanged = ServiceError<20010, 'SOURCE_CHANGED'>;
/** A step of `runSteps` failed; the steps before it are done. */
type StepFailed = ServiceError<20011, 'STEP_FAILED'> & { data: { done: number; reason: string } };

type RemoteError =
	| RemoteNotLinked
	| RemoteFailed
	| SourceChanged
	| SnapshotError
	| ServiceError<5000, 'GET_SETTING_FAILED'>;

/** `publish`: from this instance to the linked one. `pull`: from the linked one into this one. */
export type Direction = 'publish' | 'pull';

type Remote = { url: string; token: string };

/** A plan between this instance and the linked one, with the hashes `startRemote` checks. */
export type RemotePlan = TargetPlan & {
	sourceHash: string;
	remote: { url: string; environment: string | null };
};

function remoteError(
	error: ServiceError<20009, 'REMOTE_REQUEST_FAILED'>,
	status: number,
	message: string
): RemoteFailed {
	return { ...error, data: { status, message } };
}

type SnapshotError =
	| SnapshotFailed
	| ServiceError<1004, 'APP_DATABASE_MISSING'>
	| ServiceError<5000, 'GET_SETTING_FAILED'>;

/** A plan for this instance, with the hash of the state it was made for. */
export type TargetPlan = {
	plan: Plan;
	/** `snapshotHash` of this instance when the plan was made. */
	targetHash: string;
};

/** A publish to this instance, as its status is reported to the publishing instance. */
export type Deployment = {
	id: string;
	source: string;
	status: 'running' | 'completed' | 'failed';
	/** Steps that have run, of `total`. */
	done: number;
	total: number;
	/** The step that runs next (or failed); `null` when every step has run. */
	current: PlanStep | null;
	warnings: PlanWarning[];
	/** Waiting for the backup made before the first step. */
	backingUp: boolean;
	backupId: string | null;
	error: string | null;
	startedAt: Date;
	finishedAt: Date | null;
};

/** What publishing to this instance needs. */
export type ApplyInput = {
	source: Snapshot;
	/** `TargetPlan.targetHash` of the plan that was shown. */
	targetHash: string;
	/** The plan removes data or code, and the user agreed to that. */
	confirmDestructive: boolean;
	tokenId: string | null;
};

/** A step is running until then; another request can take over a deployment after it. */
const LOCK_MS = 3 * 60 * 1000;

/** Failed attempts of a step before the deployment fails. */
const MAX_ATTEMPTS = 3;

/** A step that can't run; the message is shown to the user. */
class StepError extends Error {}

function reason(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

/** A service error as the error message of a step, e.g. `COLLECTION_IN_USE (6009)`. */
function describe(error: ServiceError<number, string>) {
	const data = error.data as { reason?: unknown; message?: unknown } | undefined;
	const detail = typeof data?.reason === 'string' ? data.reason : data?.message;

	return `${error.message} (${error.code})${typeof detail === 'string' ? `: ${detail}` : ''}`;
}

type DeploymentRow = typeof deployments.$inferSelect;

function toDeployment(row: DeploymentRow, backingUp = false): Deployment {
	return {
		id: row.id,
		source: row.source,
		status: row.status,
		done: row.done,
		total: row.steps.length,
		current: row.steps[row.done] ?? null,
		warnings: row.warnings,
		backingUp,
		backupId: row.backupId,
		error: row.error,
		startedAt: row.startedAt,
		finishedAt: row.finishedAt
	};
}

/** A deploy token as the Environments page lists it; the token itself is only shown once. */
export type DeployToken = {
	id: string;
	name: string;
	createdAt: Date;
	lastUsedAt: Date | null;
};

/** Prefix of deploy tokens, so they are recognisable (e.g. by secret scanners). */
const TOKEN_PREFIX = 'pbdt_';

/** `last_used_at` is written at most this often per token. */
const LAST_USED_INTERVAL = 60 * 1000;

const TOKEN_COLUMNS = {
	id: deployTokens.id,
	name: deployTokens.name,
	createdAt: deployTokens.createdAt,
	lastUsedAt: deployTokens.lastUsedAt
};

/**
 * Every index of the collection tables, per table: `[table, index, unique, column]` rows. Internal
 * tables (`_cf_*` of D1, which can't be read, and Pouchbase's own `_*` tables) are left out.
 */
const INDEXES_SQL = `SELECT m.name, il.name, il."unique", ii.name FROM sqlite_master AS m JOIN pragma_index_list(m.name) AS il JOIN pragma_index_info(il.name) AS ii WHERE m.type = 'table' AND substr(m.name, 1, 1) != '_' AND substr(m.name, 1, 7) != 'sqlite_' AND il.origin != 'pk' ORDER BY m.name, il.name, ii.seqno`;

/** Groups the index rows per table, leaving out the indexes owned by "Unique" fields. */
function groupIndexes(rows: unknown[][], managed: Set<string>) {
	const tables = new Map<string, Map<string, SnapshotIndex>>();

	for (const [table, name, unique, column] of rows) {
		if (managed.has(String(name))) {
			continue;
		}

		const indexes = tables.get(String(table)) ?? new Map<string, SnapshotIndex>();
		const index = indexes.get(String(name)) ?? {
			name: String(name),
			columns: [],
			unique: Number(unique) === 1
		};

		index.columns.push(String(column));
		indexes.set(String(name), index);
		tables.set(String(table), indexes);
	}

	return new Map([...tables].map(([table, indexes]) => [table, [...indexes.values()]]));
}

export class EnvironmentsService extends Service {
	/** Whether this instance is for development or production; `null` when it isn't set. */
	get(): ResultAsync<Environment | null, ServiceError<5000, 'GET_SETTING_FAILED'>> {
		return this.services
			.settings()
			.get('environment')
			.map((value) =>
				ENVIRONMENTS.includes(value as Environment) ? (value as Environment) : null
			);
	}

	/** `null` turns environments off for this instance. */
	set(
		environment: Environment | null
	): ResultAsync<void, ServiceError<5001, 'SET_SETTING_FAILED'>> {
		return this.services.settings().set('environment', environment ?? '');
	}

	/** The schema and configuration of this instance, as it is sent to another instance. */
	snapshot(): ResultAsync<Snapshot, SnapshotError> {
		const settingKeys = [...SNAPSHOT_SETTING_KEYS, ...SNAPSHOT_SECRET_KEYS, 'environment'] as const;

		return this.services
			.database()
			.requireApp()
			.andThen((appDatabase) =>
				this.services
					.settings()
					.getMany(settingKeys)
					.map((values) => ({ appDatabase, values }))
			)
			.andThen(({ appDatabase, values }) =>
				fromPromise(
					(async (): Promise<Snapshot> => {
						const [snapshotCollections, functionRows, versionRows, pluginRows, providers] =
							await Promise.all([
								this.readCollections(appDatabase.id),
								this.db.select().from(functions).orderBy(asc(functions.name)),
								// Only the version that runs, not the history.
								this.db
									.select()
									.from(functionVersions)
									.where(
										sql`${functionVersions.number} = (SELECT MAX(v.number) FROM function_versions AS v WHERE v.function_id = ${functionVersions.functionId})`
									),
								this.db.select().from(plugins).orderBy(asc(plugins.id)),
								this.services.oauthProviders().list()
							]);

						if (providers.isErr()) {
							throw providers.error;
						}

						const secrets = await Promise.all(
							functionRows.map(async (row) => {
								// A function that was never deployed has no Worker, and so no secrets.
								if (!row.url) {
									return [];
								}

								const result = await this.services.functions().secrets(row.id);

								return result.isOk() ? result.value : [];
							})
						);

						return {
							format: SNAPSHOT_FORMAT,
							instance: POUCHBASE_INSTANCE,
							environment: values.environment,
							createdAt: new Date().toISOString(),
							pluginApiVersions: [...SUPPORTED_API_VERSIONS],
							collections: snapshotCollections,
							functions: functionRows.map((row, index) => {
								const version = versionRows.find((candidate) => candidate.functionId === row.id);

								return {
									name: row.name,
									description: row.description,
									requireAuth: row.requireAuth,
									code: version
										? {
												language: version.language,
												source: version.source,
												compiled: version.compiled
											}
										: null,
									secrets: secrets[index].sort()
								};
							}),
							plugins: pluginRows.map((row) => ({
								id: row.id,
								name: row.name,
								version: row.version,
								apiVersion: row.apiVersion,
								integrity: row.integrity,
								registryUrl: row.registryUrl
							})),
							settings: Object.fromEntries(
								SNAPSHOT_SETTING_KEYS.flatMap((key) => {
									const value = values[key];
									return value === null ? [] : [[key, value]];
								})
							),
							secrets: Object.fromEntries(SNAPSHOT_SECRET_KEYS.map((key) => [key, !!values[key]])),
							oauthProviders: providers.value.map((provider) => ({
								provider: provider.provider,
								label: provider.label,
								pluginId: provider.pluginId,
								enabled: provider.enabled,
								clientId: provider.clientId,
								hasSecret: provider.hasSecret
							}))
						};
					})(),
					(error) => this.error(20000, 'SNAPSHOT_FAILED', error)
				)
			);
	}

	/** The collections of this instance as a snapshot has them: fields, indexes and settings. */
	collections(): ResultAsync<
		SnapshotCollection[],
		| SnapshotFailed
		| ServiceError<1004, 'APP_DATABASE_MISSING'>
		| ServiceError<5000, 'GET_SETTING_FAILED'>
	> {
		return this.services
			.database()
			.requireApp()
			.andThen((appDatabase) =>
				fromPromise(this.readCollections(appDatabase.id), (error) =>
					this.error(20000, 'SNAPSHOT_FAILED', error)
				)
			);
	}

	/**
	 * Runs the steps of a plan in this request, in order, as the steps of a publish run. Stops at
	 * the first step that fails; `done` says how many ran before it. Refused while a publish, pull,
	 * backup or restore runs.
	 */
	runSteps(
		steps: PlanStep[]
	): ResultAsync<
		void,
		DeploymentsFailed | JobRunning | StepFailed | ErrorOf<ReturnType<BackupsService['running']>>
	> {
		return this.running()
			.andThen((running) =>
				running ? errAsync(this.error(20006, 'JOB_RUNNING')) : this.services.backups().running()
			)
			.andThen((running) =>
				running ? errAsync(this.error(20006, 'JOB_RUNNING')) : okAsync(undefined)
			)
			.andThen(() => {
				let done = 0;

				return fromPromise(
					(async () => {
						for (const step of steps) {
							await this.runPlanStep(step);
							done++;
						}
					})(),
					(error): StepFailed => ({
						...this.error(20011, 'STEP_FAILED', error),
						data: { done, reason: reason(error) }
					})
				);
			});
	}

	/** The collections with their fields and custom indexes, by name. */
	private async readCollections(appDatabaseId: string): Promise<SnapshotCollection[]> {
		const [collectionRows, fieldRows, indexRows] = await Promise.all([
			this.db.select().from(collections).orderBy(asc(collections.name)),
			this.db.select().from(fields).orderBy(asc(fields.position), asc(fields.createdAt)),
			queryDatabase(appDatabaseId, INDEXES_SQL)
		]);

		const indexes = groupIndexes(
			indexRows,
			new Set(fieldRows.filter((field) => field.unique).map(uniqueIndexName))
		);

		return collectionRows.map((collection) => ({
			id: collection.id,
			name: collection.name,
			system: collection.system,
			settings: collection.settings,
			// Positions as a rank, so gaps left by deleted fields aren't changes.
			fields: fieldRows
				.filter((field) => field.collectionId === collection.id)
				.map((field, position) => ({
					id: field.id,
					name: field.name,
					type: field.type,
					required: field.required,
					unique: field.unique,
					defaultValue: field.defaultValue,
					options: field.options,
					system: field.system,
					position
				})),
			indexes: indexes.get(collection.name) ?? []
		}));
	}

	/** What applying `source` to this instance would change. */
	plan(source: Snapshot): ResultAsync<TargetPlan, SnapshotError> {
		return this.snapshot().andThen((target) =>
			fromPromise(snapshotHash(target), (error) => this.error(20000, 'SNAPSHOT_FAILED', error)).map(
				(targetHash) => ({ plan: diff(source, target), targetHash })
			)
		);
	}

	/** The deploy tokens other instances use to reach this one, newest first. */
	tokens(): ResultAsync<DeployToken[], TokensFailed> {
		return fromPromise(
			this.db.select(TOKEN_COLUMNS).from(deployTokens).orderBy(desc(deployTokens.createdAt)),
			(error) => this.error(20001, 'DEPLOY_TOKENS_QUERY_FAILED', error)
		);
	}

	/** Creates a deploy token; `token` can't be read back later. */
	createToken(name: string): ResultAsync<DeployToken & { token: string }, TokensFailed> {
		const token = `${TOKEN_PREFIX}${generateToken()}`;

		return fromPromise(
			(async () => {
				const [row] = await this.db
					.insert(deployTokens)
					.values({ name, tokenHash: await hashToken(token) })
					.returning(TOKEN_COLUMNS);

				return { ...row, token };
			})(),
			(error) => this.error(20001, 'DEPLOY_TOKENS_QUERY_FAILED', error)
		);
	}

	deleteToken(id: string): ResultAsync<void, TokensFailed | TokenNotFound> {
		return fromPromise(
			this.db
				.delete(deployTokens)
				.where(eq(deployTokens.id, id))
				.returning({ id: deployTokens.id }),
			(error) => this.error(20001, 'DEPLOY_TOKENS_QUERY_FAILED', error)
		).andThen((rows) =>
			rows.length ? okAsync(undefined) : errAsync(this.error(20002, 'DEPLOY_TOKEN_NOT_FOUND'))
		);
	}

	/** The deploy token with this value, `null` when there is none; records that it was used. */
	verifyToken(token: string): ResultAsync<DeployToken | null, TokensFailed> {
		if (!token.startsWith(TOKEN_PREFIX)) {
			return okAsync(null);
		}

		return fromPromise(
			(async () => {
				const [row] = await this.db
					.select(TOKEN_COLUMNS)
					.from(deployTokens)
					.where(eq(deployTokens.tokenHash, await hashToken(token)));

				if (!row) {
					return null;
				}

				const now = new Date();

				if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_INTERVAL) {
					await this.db
						.update(deployTokens)
						.set({ lastUsedAt: now })
						.where(eq(deployTokens.id, row.id));
				}

				return { ...row, lastUsedAt: now };
			})(),
			(error) => this.error(20001, 'DEPLOY_TOKENS_QUERY_FAILED', error)
		);
	}

	/**
	 * Starts publishing `source` to this instance: checks that the instance is still in the state the
	 * plan was made for, makes a backup when a backup destination exists, and records the steps. The
	 * steps run in `advance` (called by the publishing instance and by the scheduled tick).
	 */
	apply(
		input: ApplyInput
	): ResultAsync<
		Deployment,
		| SnapshotError
		| DeploymentsFailed
		| TargetChanged
		| NotConfirmed
		| JobRunning
		| ErrorOf<ReturnType<BackupsService['destinations']>>
		| ErrorOf<ReturnType<BackupsService['running']>>
		| ErrorOf<ReturnType<BackupsService['start']>>
	> {
		const backupsService = this.services.backups();

		return this.running()
			.andThen((running) =>
				running ? errAsync(this.error(20006, 'JOB_RUNNING')) : backupsService.running()
			)
			.andThen((running) =>
				running ? errAsync(this.error(20006, 'JOB_RUNNING')) : this.plan(input.source)
			)
			.andThen(({ plan, targetHash }) => {
				if (targetHash !== input.targetHash) {
					return errAsync(this.error(20004, 'TARGET_CHANGED'));
				}

				if (planSeverity(plan) === 'destructive' && !input.confirmDestructive) {
					return errAsync(this.error(20005, 'DESTRUCTIVE_NOT_CONFIRMED'));
				}

				return okAsync(plan);
			})
			.andThen((plan) => {
				// Nothing to back up for an empty plan.
				if (!plan.steps.length) {
					return okAsync({ plan, backupId: null });
				}

				return backupsService
					.destinations()
					.andThen(([destination]) =>
						destination ? backupsService.start(destination.id, false) : okAsync(null)
					)
					.map((backupId) => ({ plan, backupId }));
			})
			.andThen(({ plan, backupId }) =>
				fromPromise(
					this.db
						.insert(deployments)
						.values({
							tokenId: input.tokenId,
							source: input.source.instance,
							steps: plan.steps,
							warnings: plan.warnings,
							backupId,
							...(!plan.steps.length && { status: 'completed' as const, finishedAt: new Date() })
						})
						.returning(),
					(error) => this.error(20003, 'DEPLOYMENTS_QUERY_FAILED', error)
				).map(([row]) => toDeployment(row, !!backupId))
			);
	}

	/** A deployment by id; `null` when there is none. */
	deployment(id: string): ResultAsync<Deployment | null, DeploymentsFailed> {
		return fromPromise(
			(async () => {
				const [row] = await this.db.select().from(deployments).where(eq(deployments.id, id));

				return row ? toDeployment(row, await this.backingUp(row)) : null;
			})(),
			(error) => this.error(20003, 'DEPLOYMENTS_QUERY_FAILED', error)
		);
	}

	/** The latest deployments, newest first. */
	deployments(limit = 20): ResultAsync<Deployment[], DeploymentsFailed> {
		return fromPromise(
			this.db.select().from(deployments).orderBy(desc(deployments.startedAt)).limit(limit),
			(error) => this.error(20003, 'DEPLOYMENTS_QUERY_FAILED', error)
		).map((rows) => rows.map((row) => toDeployment(row)));
	}

	/** Whether a deployment is running. */
	running(): ResultAsync<boolean, DeploymentsFailed> {
		return fromPromise(
			this.db
				.select({ id: deployments.id })
				.from(deployments)
				.where(eq(deployments.status, 'running'))
				.limit(1),
			(error) => this.error(20003, 'DEPLOYMENTS_QUERY_FAILED', error)
		).map((rows) => rows.length > 0);
	}

	/**
	 * Runs steps of the running deployment for up to `budget` milliseconds (always at least one).
	 * A step that fails is tried again later; the deployment fails after `MAX_ATTEMPTS` in a row.
	 * Returns whether a deployment is still running.
	 */
	advance(budget: number): ResultAsync<{ running: boolean }, DeploymentsFailed | StepsFailed> {
		return fromPromise(
			(async () => {
				const deadline = Date.now() + budget;

				do {
					if (!(await this.runStep(Math.max(deadline - Date.now(), 0)))) {
						break;
					}
				} while (Date.now() < deadline);
			})(),
			(error) => this.error(20007, 'STEPS_FAILED', error)
		).andThen(() => this.running().map((running) => ({ running })));
	}

	/** Whether the deployment still waits for the backup made before its first step. */
	private async backingUp(row: DeploymentRow) {
		if (!row.backupId || row.done > 0 || row.status !== 'running') {
			return false;
		}

		const [backup] = await this.db
			.select({ status: backups.status })
			.from(backups)
			.where(eq(backups.id, row.backupId));

		return backup?.status === 'running';
	}

	/** Runs one step of the running deployment. Returns whether there was one to run. */
	private async runStep(budget: number) {
		const now = new Date();
		const free = or(isNull(deployments.lockedUntil), lt(deployments.lockedUntil, now));

		const [row] = await this.db
			.update(deployments)
			.set({ lockedUntil: new Date(now.getTime() + LOCK_MS) })
			.where(
				eq(
					deployments.id,
					sql`(SELECT ${deployments.id} FROM ${deployments} WHERE ${and(eq(deployments.status, 'running'), free)} ORDER BY ${deployments.startedAt} LIMIT 1)`
				)
			)
			.returning();

		if (!row) {
			return false;
		}

		const release = (values: Partial<DeploymentRow>) =>
			this.db
				.update(deployments)
				.set({ lockedUntil: null, ...values })
				.where(eq(deployments.id, row.id));

		try {
			if (row.backupId && row.done === 0) {
				const [backup] = await this.db
					.select({ status: backups.status, error: backups.error })
					.from(backups)
					.where(eq(backups.id, row.backupId));

				if (backup?.status === 'failed') {
					// Trying again won't help: the deployment fails right away.
					await release({
						error: `The backup before publishing failed: ${backup.error ?? 'unknown error'}`,
						status: 'failed',
						finishedAt: new Date()
					});

					return true;
				}

				if (backup?.status === 'running') {
					// The backup runs its own steps; the deployment continues once it is completed.
					const advanced = await this.services.backups().advance(budget);

					await release({});

					if (advanced.isErr()) {
						console.warn(
							`[environments] backup of deployment ${row.id}: ${describe(advanced.error)}`
						);
					}

					return true;
				}
			}

			const step = row.steps[row.done];

			if (step) {
				await this.runPlanStep(step);
			}

			const done = row.done + 1;

			await release({
				done,
				attempts: 0,
				error: null,
				...(done >= row.steps.length && { status: 'completed' as const, finishedAt: new Date() })
			});
		} catch (error) {
			const attempts = row.attempts + 1;
			const failed = attempts >= MAX_ATTEMPTS;

			console.warn(`[environments] deployment ${row.id} step ${row.done}: ${reason(error)}`);

			await release({
				attempts,
				error: reason(error),
				...(failed && { status: 'failed' as const, finishedAt: new Date() })
			});
		}

		return true;
	}

	/** The value of a service result; throws a `StepError` with the service error otherwise. */
	private async must<T>(result: ResultAsync<T, ServiceError<number, string>>) {
		const settled = await result;

		if (settled.isErr()) {
			throw new StepError(describe(settled.error));
		}

		return settled.value;
	}

	/** The collection by id: names change during a plan, ids don't. */
	private collection(id: string) {
		return this.must(this.services.collections().getById(id));
	}

	private async requireCollection(id: string, name: string) {
		const collection = await this.collection(id);

		if (!collection) {
			throw new StepError(`Collection ${name} not found`);
		}

		return collection;
	}

	private async field(id: string) {
		const [field] = await this.db.select().from(fields).where(eq(fields.id, id));
		return field ?? null;
	}

	/** Every field of the collection as `updateAll` takes them, in `order` (others after them). */
	private async fieldChanges(collectionId: string, order: string[] = []): Promise<FieldChange[]> {
		const current = await this.must(this.services.fields().list(collectionId));
		const rank = (id: string) => {
			const index = order.indexOf(id);
			return index === -1 ? order.length : index;
		};

		return [...current]
			.sort((a, b) => rank(a.id) - rank(b.id))
			.map((field) => ({
				id: field.id,
				name: field.name,
				required: field.required,
				unique: field.unique,
				remove: false
			}));
	}

	private createField(collectionName: string, field: SnapshotField) {
		return this.must(
			this.services.fields().create(collectionName, {
				id: field.id,
				name: field.name,
				type: field.type,
				required: field.required,
				unique: field.unique,
				defaultValue: field.defaultValue ?? undefined,
				options: field.options,
				system: field.system
			})
		);
	}

	/**
	 * Runs one step of a plan through the services, as if it was made in the UI. A step that already
	 * happened (tried again after a timeout) is skipped.
	 */
	private async runPlanStep(step: PlanStep) {
		const services = this.services;

		switch (step.kind) {
			case 'index.drop': {
				const collection = await this.requireCollection(step.collectionId, step.collection);
				const result = await services.indexes().delete(collection.name, step.name);

				// 9004: the index is already gone.
				if (result.isErr() && result.error.code !== 9004) {
					throw new StepError(describe(result.error));
				}

				return;
			}

			case 'field.delete': {
				const [collection, field] = await Promise.all([
					this.collection(step.collectionId),
					this.field(step.fieldId)
				]);

				if (collection && field) {
					await this.must(services.fields().delete(collection.name, field.name));
				}

				return;
			}

			case 'collection.delete': {
				const collection = await this.collection(step.collectionId);

				if (collection) {
					await this.must(services.collections().delete(collection.name));
				}

				return;
			}

			case 'collection.rename': {
				const collection = await this.requireCollection(step.collectionId, step.from);

				if (collection.name !== step.to) {
					await this.must(services.collections().rename(collection.name, step.to));
				}

				return;
			}

			case 'collection.create': {
				if (!(await this.collection(step.collectionId))) {
					await this.must(services.collections().create(step.collection, step.collectionId));
				}

				return;
			}

			case 'field.update': {
				const collection = await this.requireCollection(step.collectionId, step.collection);
				const field = await this.field(step.field.id);

				if (step.changes.includes('type')) {
					// SQLite can't convert a column: it is dropped and created again, with the same id.
					if (field && field.type !== step.field.type) {
						await this.must(services.fields().delete(collection.name, field.name));
					}

					if (!field || field.type !== step.field.type) {
						await this.createField(collection.name, step.field);
					}

					return;
				}

				if (!field) {
					throw new StepError(`Field ${step.from} not found in ${collection.name}`);
				}

				if (step.changes.some((change) => ['name', 'required', 'unique'].includes(change))) {
					const changes = (await this.fieldChanges(collection.id)).map((change) =>
						change.id === field.id
							? {
									...change,
									name: step.field.name,
									required: step.field.required,
									unique: step.field.unique
								}
							: change
					);

					await this.must(services.fields().updateAll(collection.name, changes));
				}

				if (step.changes.includes('defaultValue') || step.changes.includes('options')) {
					await this.must(
						step.field.type === 'computed'
							? services
									.fields()
									.updateComputed(collection.name, step.field.name, step.field.options)
							: services.fields().update(collection.name, step.field.name, {
									defaultValue: step.field.defaultValue ?? undefined,
									options: step.field.options
								})
					);
				}

				return;
			}

			case 'field.create': {
				const collection = await this.requireCollection(step.collectionId, step.collection);

				if (!(await this.field(step.field.id))) {
					await this.createField(collection.name, step.field);
				}

				return;
			}

			case 'collection.order': {
				const collection = await this.requireCollection(step.collectionId, step.collection);
				const changes = await this.fieldChanges(collection.id, step.fieldIds);

				await this.must(services.fields().updateAll(collection.name, changes));

				return;
			}

			case 'index.create': {
				const collection = await this.requireCollection(step.collectionId, step.collection);
				const existing = await this.must(services.indexes().list(collection.name));
				const exists = existing.some(
					(index) =>
						!index.managedBy &&
						index.unique === step.unique &&
						index.columns.join(',') === step.columns.join(',')
				);

				if (!exists) {
					await this.must(
						services
							.indexes()
							.create(collection.name, { columns: step.columns, unique: step.unique })
					);
				}

				return;
			}

			case 'collection.settings': {
				const collection = await this.requireCollection(step.collectionId, step.collection);

				await this.must(
					services.collections().updateSettings(collection.name, {
						thumbnails: step.settings.thumbnails,
						rules: step.settings.rules
					})
				);

				return;
			}

			case 'function.delete': {
				const fn = await this.must(services.functions().get(step.name));

				if (fn) {
					await this.must(services.functions().delete(fn.id));
				}

				return;
			}

			case 'function.create':
			case 'function.update': {
				const { fn } = step;
				let existing = await this.must(services.functions().get(fn.name));

				if (!existing) {
					const created = await this.must(
						services.functions().create({
							name: fn.name,
							description: fn.description,
							requireAuth: fn.requireAuth,
							language: fn.code?.language ?? 'typescript'
						})
					);

					// Created with the starter code: the published code is deployed below.
					existing = { ...created, source: '' };
				} else if (
					existing.description !== fn.description ||
					existing.requireAuth !== fn.requireAuth
				) {
					await this.must(
						services
							.functions()
							.update(existing.id, { description: fn.description, requireAuth: fn.requireAuth })
					);
				}

				if (
					fn.code &&
					(fn.code.source !== existing.source || fn.code.language !== existing.language)
				) {
					await this.must(
						services.functions().deploy(existing.id, {
							language: fn.code.language,
							source: fn.code.source,
							compiled: fn.code.compiled ?? undefined
						})
					);
				}

				return;
			}

			case 'plugin.remove': {
				await this.must(services.plugins().uninstall(step.id));
				return;
			}

			case 'plugin.install': {
				await this.must(services.plugins().install(step.plugin.id, step.plugin.version));
				return;
			}

			case 'setting.set': {
				await this.must(services.settings().set(step.key, step.to));
				return;
			}

			case 'oauth.update': {
				const current = await this.must(services.oauthProviders().credentials(step.provider));

				// No plugin on this instance contributes the provider (the plan warned about it).
				if (!current) {
					console.warn(`[environments] Skipping sign-in with ${step.provider}: no plugin has it`);
					return;
				}

				// The secret is never published: without one on this instance, the provider stays off.
				await this.must(
					services.oauthProviders().update(step.provider, {
						enabled: step.enabled && !!current?.clientSecret,
						clientId: step.clientId
					})
				);

				return;
			}
		}
	}

	/** The instance this one publishes to and pulls from; `null` when none is linked. */
	remote(): ResultAsync<
		{ url: string; hasToken: boolean } | null,
		ServiceError<5000, 'GET_SETTING_FAILED'>
	> {
		return this.services
			.settings()
			.getMany(['environment_remote_url', 'environment_remote_token'])
			.map((values) =>
				values.environment_remote_url
					? { url: values.environment_remote_url, hasToken: !!values.environment_remote_token }
					: null
			);
	}

	/**
	 * Links another instance after checking that its URL and deploy token work. Returns the
	 * environment of that instance.
	 */
	link(
		url: string,
		token: string
	): ResultAsync<
		{ environment: string | null },
		RemoteFailed | ServiceError<5001, 'SET_SETTING_FAILED'>
	> {
		const base = url.trim().replace(/\/+$/, '');

		return this.request<unknown>({ url: base, token }, 'GET', '/internal/environment/snapshot')
			.andThen((body) => {
				const parsed = snapshotSchema.safeParse(body);

				return parsed.success
					? okAsync(parsed.data)
					: errAsync(
							remoteError(
								this.error(20009, 'REMOTE_REQUEST_FAILED'),
								0,
								'Not a Pouchbase instance, or a different version'
							)
						);
			})
			.andThen((snapshot) =>
				this.services
					.settings()
					.setMany({ environment_remote_url: base, environment_remote_token: token })
					.map(() => ({ environment: snapshot.environment }))
			);
	}

	unlink(): ResultAsync<void, ServiceError<5001, 'SET_SETTING_FAILED'>> {
		return this.services
			.settings()
			.setMany({ environment_remote_url: '', environment_remote_token: '' });
	}

	/**
	 * What publishing this instance to the linked one (`publish`), or pulling the linked one into
	 * this one (`pull`), would change. Changes nothing.
	 */
	remotePlan(direction: Direction): ResultAsync<RemotePlan, RemoteError> {
		return this.remoteSnapshots(direction).andThen(({ remote, source, sourceHash }) => {
			if (direction === 'pull') {
				return this.plan(source).map(({ plan, targetHash }) => ({
					plan,
					targetHash,
					sourceHash,
					remote: { url: remote.url, environment: source.environment }
				}));
			}

			return this.request<unknown>(remote, 'POST', '/internal/environment/plan', source).andThen(
				(body) => {
					const parsed = remotePlanSchema.safeParse(body);

					if (!parsed.success) {
						return errAsync(
							remoteError(this.error(20009, 'REMOTE_REQUEST_FAILED'), 0, 'Unexpected response')
						);
					}

					return okAsync({
						plan: parsed.data.plan as Plan,
						targetHash: parsed.data.targetHash,
						sourceHash,
						remote: { url: remote.url, environment: parsed.data.target.environment }
					});
				}
			);
		});
	}

	/**
	 * Starts publishing (`publish`) or pulling (`pull`) as planned. Refused when the source changed
	 * since the plan was made; the target checks the same for itself.
	 */
	startRemote(
		direction: Direction,
		input: { sourceHash: string; targetHash: string; confirmDestructive: boolean }
	): ResultAsync<Deployment, RemoteError | ErrorOf<ReturnType<EnvironmentsService['apply']>>> {
		return this.remoteSnapshots(direction).andThen(({ remote, source, sourceHash }) => {
			if (sourceHash !== input.sourceHash) {
				return errAsync(this.error(20010, 'SOURCE_CHANGED'));
			}

			if (direction === 'pull') {
				return this.apply({
					source,
					targetHash: input.targetHash,
					confirmDestructive: input.confirmDestructive,
					tokenId: null
				});
			}

			return this.request<unknown>(remote, 'POST', '/internal/environment/apply', {
				snapshot: source,
				targetHash: input.targetHash,
				confirmDestructive: input.confirmDestructive
			}).andThen((body) => this.parseDeployment(body));
		});
	}

	/**
	 * Runs steps of a publish (on the linked instance) or a pull (on this one) and returns its
	 * status; called until it is done.
	 */
	advanceRemote(
		direction: Direction,
		id: string,
		budget: number
	): ResultAsync<Deployment | null, RemoteError | DeploymentsFailed | StepsFailed> {
		if (direction === 'pull') {
			return this.advance(budget).andThen(() => this.deployment(id));
		}

		return this.linked().andThen((remote) =>
			this.request<unknown>(
				remote,
				'POST',
				`/internal/environment/deployments/${encodeURIComponent(id)}`
			).andThen((body) => this.parseDeployment(body))
		);
	}

	/** The linked instance with its token; an error when none is linked. */
	private linked(): ResultAsync<
		Remote,
		RemoteNotLinked | ServiceError<5000, 'GET_SETTING_FAILED'>
	> {
		return this.services
			.settings()
			.getMany(['environment_remote_url', 'environment_remote_token'])
			.andThen((values) =>
				values.environment_remote_url && values.environment_remote_token
					? okAsync({ url: values.environment_remote_url, token: values.environment_remote_token })
					: errAsync(this.error(20008, 'REMOTE_NOT_LINKED'))
			);
	}

	/** The source snapshot of a publish (this instance) or a pull (the linked one), with its hash. */
	private remoteSnapshots(
		direction: Direction
	): ResultAsync<{ remote: Remote; source: Snapshot; sourceHash: string }, RemoteError> {
		return this.linked()
			.andThen((remote) => {
				if (direction === 'publish') {
					return this.snapshot().map((source) => ({ remote, source }));
				}

				return this.request<unknown>(remote, 'GET', '/internal/environment/snapshot').andThen(
					(body) => {
						const parsed = snapshotSchema.safeParse(body);

						return parsed.success
							? okAsync({ remote, source: parsed.data })
							: errAsync(
									remoteError(
										this.error(20009, 'REMOTE_REQUEST_FAILED'),
										0,
										'The linked instance runs a different version'
									)
								);
					}
				);
			})
			.andThen(({ remote, source }) =>
				fromPromise(snapshotHash(source), (error) =>
					this.error(20000, 'SNAPSHOT_FAILED', error)
				).map((sourceHash) => ({ remote, source, sourceHash }))
			);
	}

	private parseDeployment(body: unknown): ResultAsync<Deployment, RemoteFailed> {
		const parsed = deploymentSchema.safeParse(body);

		return parsed.success
			? okAsync(parsed.data as Deployment)
			: errAsync(remoteError(this.error(20009, 'REMOTE_REQUEST_FAILED'), 0, 'Unexpected response'));
	}

	/** Calls an `/internal/environment/...` endpoint of another instance. */
	private request<T>(
		remote: Remote,
		method: 'GET' | 'POST',
		path: string,
		body?: unknown
	): ResultAsync<T, RemoteFailed> {
		return fromPromise(
			fetch(`${remote.url}${path}`, {
				method,
				headers: {
					authorization: `Bearer ${remote.token}`,
					...(body !== undefined && { 'content-type': 'application/json' })
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				redirect: 'error'
			}),
			(error) =>
				remoteError(
					this.error(20009, 'REMOTE_REQUEST_FAILED', error),
					0,
					`Could not reach ${remote.url}`
				)
		).andThen((response) =>
			ResultAsync.fromSafePromise(response.json().catch(() => null) as Promise<unknown>).andThen(
				(json) => {
					if (response.ok) {
						return okAsync(json as T);
					}

					const message = (json as { message?: unknown } | null)?.message;

					return errAsync(
						remoteError(
							this.error(20009, 'REMOTE_REQUEST_FAILED'),
							response.status,
							typeof message === 'string' ? message : `${response.status} ${response.statusText}`
						)
					);
				}
			)
		);
	}
}
