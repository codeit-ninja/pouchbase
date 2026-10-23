import type { ServiceError } from './base.service';
import type { AppUser } from './auth.service';
import type { FunctionLog } from '../platform';
import type { ResultAsync } from 'neverthrow';

import { desc, eq, max } from 'drizzle-orm';
import { errAsync, fromPromise, okAsync } from 'neverthrow';

import type { FunctionLanguage } from '#lib/functions/functions.js';

import {
	functionTemplate,
	MAX_CODE_SIZE,
	RESERVED_ENV_NAMES,
	USER_HEADER
} from '#lib/functions/functions.js';

import { generateToken } from '../crypto';
import { functions, functionVersions } from '../db';
import {
	ENTRY_CODE,
	ENTRY_MODULE,
	FUNCTION_MODULE,
	headerJson,
	scriptName,
	SECRET_HEADER
} from '../functions';
import { functions as driver, PlatformError } from '../platform';
import { Service } from './base.service';

/**
 * Serverless functions: code written or uploaded on the Functions page that runs as a Worker of
 * its own (`<instance>-fn-<name>`) on the Cloudflare account. Every deploy is kept as a version;
 * secrets live only on the Worker. Apps call a function through `/api/functions/<name>`, which
 * forwards the request to the Worker (see `../functions.ts`).
 */

type FunctionRow = typeof functions.$inferSelect;

/** A function as the Functions pages show it; the shared secret stays on the server. */
export type FunctionInfo = {
	id: string;
	name: string;
	description: string;
	requireAuth: boolean;
	/** Whether the function has been deployed (it is, unless the first deploy failed). */
	deployed: boolean;
	/** Number of the version that runs, `null` before the first deploy. */
	version: number | null;
	language: FunctionLanguage | null;
	createdAt: Date;
	updatedAt: Date;
};

export type FunctionDetail = FunctionInfo & {
	/** Code of the version that runs; the starter code before the first deploy. */
	source: string;
};

export type FunctionVersion = {
	id: string;
	number: number;
	language: FunctionLanguage;
	/** Bytes of the source. */
	size: number;
	createdAt: Date;
};

export type FunctionCode = {
	language: FunctionLanguage;
	source: string;
	/** JavaScript compiled from TypeScript (in the browser); omitted for JavaScript. */
	compiled?: string;
};

export type FunctionRequest = {
	method: string;
	/** Path after `/api/functions/<name>`, with the query string, e.g. `/hello?name=Ada`. */
	path: string;
	headers: Record<string, string>;
	body: string | null;
};

export type FunctionResponse = {
	status: number;
	statusText: string;
	headers: [string, string][];
	body: string;
	/** The body was cut off after `MAX_TEST_BODY` characters. */
	truncated: boolean;
	durationMs: number;
};

type QueryFailed = ServiceError<18000, 'FUNCTIONS_QUERY_FAILED'>;
type FunctionNotFound = ServiceError<18001, 'FUNCTION_NOT_FOUND'>;
type NameTaken = ServiceError<18002, 'FUNCTION_NAME_TAKEN'>;
type CodeTooLarge = ServiceError<18003, 'CODE_TOO_LARGE'>;
type NoSubdomain = ServiceError<18004, 'NO_WORKERS_SUBDOMAIN'>;
type DeployFailed = ServiceError<18005, 'DEPLOY_FAILED'> & { data: { reason: string } };
type DeleteFailed = ServiceError<18006, 'DELETE_FUNCTION_FAILED'>;
type VersionNotFound = ServiceError<18007, 'VERSION_NOT_FOUND'>;
type SecretsFailed = ServiceError<18008, 'SECRETS_FAILED'> & { data: { reason: string } };
type NotDeployed = ServiceError<18009, 'FUNCTION_NOT_DEPLOYED'>;
type LogsFailed = ServiceError<18010, 'LOGS_FAILED'>;
type LogsForbidden = ServiceError<18011, 'LOGS_FORBIDDEN'>;
type InvokeFailed = ServiceError<18012, 'INVOKE_FAILED'> & { data: { reason: string } };

type DeployError =
	| QueryFailed
	| CodeTooLarge
	| NoSubdomain
	| DeployFailed
	| ServiceError<23000, 'API_KEYS_QUERY_FAILED'>;

/** Headers a caller can't pass on to a function. */
const STRIPPED_HEADERS = [
	'host',
	// The admin's session cookie on this origin must never reach a function.
	'cookie',
	SECRET_HEADER,
	USER_HEADER,
	'content-length',
	'cf-connecting-ip',
	'cf-ray',
	'cf-visitor',
	'cf-worker',
	'cf-ew-via',
	'x-forwarded-host',
	'x-forwarded-proto'
];

/** How much of a response body the test panel shows. */
const MAX_TEST_BODY = 100_000;

/** How long the test panel waits for a function. */
const TEST_TIMEOUT = 30_000;

/** The API's messages, e.g. the syntax error a deploy failed with. */
function reason(error: unknown) {
	if (error instanceof PlatformError && error.errors.length) {
		return error.errors.map((item) => item.message).join('; ');
	}

	return error instanceof Error ? error.message : String(error);
}

function byteLength(value: string) {
	return new TextEncoder().encode(value).byteLength;
}

type VersionSummary = Pick<typeof functionVersions.$inferSelect, 'number' | 'language'>;

function info(row: FunctionRow, version: VersionSummary | null): FunctionInfo {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		requireAuth: row.requireAuth,
		deployed: !!row.url && !!version,
		version: version?.number ?? null,
		language: version?.language ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

export class FunctionsService extends Service {
	/** Every function with the version that runs, by name. */
	list(): ResultAsync<FunctionInfo[], QueryFailed> {
		return fromPromise(
			Promise.all([
				this.db.select().from(functions).orderBy(functions.name),
				this.db
					.select({
						functionId: functionVersions.functionId,
						number: functionVersions.number,
						language: functionVersions.language
					})
					.from(functionVersions)
			]),
			(error) => this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
		).map(([rows, versions]) => {
			const latest = new Map<string, VersionSummary>();

			for (const version of versions) {
				if (version.number > (latest.get(version.functionId)?.number ?? 0)) {
					latest.set(version.functionId, version);
				}
			}

			return rows.map((row) => info(row, latest.get(row.id) ?? null));
		});
	}

	/** The function with this name and the code that runs, or `null`. */
	get(name: string): ResultAsync<FunctionDetail | null, QueryFailed> {
		return this.findRow(name).andThen((row) => {
			if (!row) {
				return okAsync(null);
			}

			return this.latestVersion(row.id).map((version) => ({
				...info(row, version),
				source: version?.source ?? functionTemplate('typescript')
			}));
		});
	}

	/** Creates the function and deploys the starter code, so its Worker exists right away. */
	create(input: {
		name: string;
		description: string;
		requireAuth: boolean;
		language: FunctionLanguage;
	}): ResultAsync<FunctionInfo, DeployError | NameTaken> {
		return this.findRow(input.name)
			.andThen((existing) =>
				existing ? errAsync(this.error(18002, 'FUNCTION_NAME_TAKEN')) : okAsync(undefined)
			)
			.andThen(() =>
				fromPromise(
					this.db
						.insert(functions)
						.values({
							name: input.name,
							description: input.description,
							requireAuth: input.requireAuth,
							secret: generateToken()
						})
						.returning(),
					(error) => this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
				)
			)
			.andThen(([row]) =>
				// Keeps the function when the deploy fails: the code can be fixed and deployed again.
				this.deployCode(row, {
					language: input.language,
					source: functionTemplate(input.language)
				}).map((version) => info(row, version))
			);
	}

	/** Changes the description and who may call the function; takes effect right away. */
	update(
		id: string,
		input: { description: string; requireAuth: boolean }
	): ResultAsync<void, QueryFailed | FunctionNotFound> {
		return fromPromise(
			this.db
				.update(functions)
				.set({ ...input, updatedAt: new Date() })
				.where(eq(functions.id, id))
				.returning({ id: functions.id }),
			(error) => this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
		).andThen((rows) =>
			rows.length ? okAsync(undefined) : errAsync(this.error(18001, 'FUNCTION_NOT_FOUND'))
		);
	}

	/** Deploys the code as a new version. */
	deploy(
		id: string,
		code: FunctionCode
	): ResultAsync<FunctionVersion, DeployError | FunctionNotFound> {
		return this.requireRow(id)
			.andThen((row) => this.deployCode(row, code))
			.map((version) => this.versionInfo(version));
	}

	/** Deploys the code of an earlier version again, as a new version. */
	restore(
		id: string,
		versionId: string
	): ResultAsync<FunctionVersion, DeployError | FunctionNotFound | VersionNotFound> {
		return this.requireRow(id).andThen((row) =>
			fromPromise(
				this.db
					.select()
					.from(functionVersions)
					.where(eq(functionVersions.id, versionId))
					.then(([version]) => (version?.functionId === row.id ? version : null)),
				(error) => this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
			)
				.andThen((version) =>
					version ? okAsync(version) : errAsync(this.error(18007, 'VERSION_NOT_FOUND'))
				)
				.andThen((version) =>
					this.deployCode(row, {
						language: version.language,
						source: version.source,
						compiled: version.compiled ?? undefined
					})
				)
				.map((version) => this.versionInfo(version))
		);
	}

	/** Every deployed version, newest first. */
	versions(id: string): ResultAsync<FunctionVersion[], QueryFailed> {
		return fromPromise(
			this.db
				.select()
				.from(functionVersions)
				.where(eq(functionVersions.functionId, id))
				.orderBy(desc(functionVersions.number)),
			(error) => this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
		).map((rows) => rows.map((row) => this.versionInfo(row)));
	}

	/** The source of a version, to look at before restoring it; `null` when it doesn't exist. */
	versionSource(
		id: string,
		versionId: string
	): ResultAsync<{ language: FunctionLanguage; source: string } | null, QueryFailed> {
		return fromPromise(
			this.db.select().from(functionVersions).where(eq(functionVersions.id, versionId)),
			(error) => this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
		).map(([version]) =>
			version?.functionId === id ? { language: version.language, source: version.source } : null
		);
	}

	/** Deletes the Worker (with its secrets), then the function and its versions. */
	delete(id: string): ResultAsync<void, QueryFailed | FunctionNotFound | DeleteFailed> {
		return this.requireRow(id)
			.andThen((row) =>
				fromPromise(driver.delete(scriptName(row.name)), (error) =>
					this.error(18006, 'DELETE_FUNCTION_FAILED', error)
				)
			)
			.andThen(() =>
				fromPromise(this.db.delete(functions).where(eq(functions.id, id)), (error) =>
					this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
				)
			)
			.map(() => undefined);
	}

	/** Names of the function's secrets; their values can't be read back. */
	secrets(id: string): ResultAsync<string[], QueryFailed | FunctionNotFound | SecretsFailed> {
		return this.requireRow(id)
			.andThen((row) =>
				fromPromise(driver.secrets(scriptName(row.name)), (error) => this.secretsError(error))
			)
			.map((names) => names.filter((name) => !RESERVED_ENV_NAMES.includes(name)));
	}

	/** Adds or replaces a secret; the Worker gets a new version with it. */
	setSecret(
		id: string,
		name: string,
		value: string
	): ResultAsync<void, QueryFailed | FunctionNotFound | NotDeployed | SecretsFailed> {
		return this.requireDeployed(id).andThen((row) =>
			fromPromise(driver.putSecret(scriptName(row.name), name, value), (error) =>
				this.secretsError(error)
			)
		);
	}

	deleteSecret(
		id: string,
		name: string
	): ResultAsync<void, QueryFailed | FunctionNotFound | SecretsFailed> {
		return this.requireRow(id).andThen((row) =>
			fromPromise(driver.deleteSecret(scriptName(row.name), name), (error) =>
				this.secretsError(error)
			)
		);
	}

	/** Log lines of the last `hours`, newest first. Needs Workers Observability on the token. */
	logs(
		id: string,
		hours: number
	): ResultAsync<FunctionLog[], QueryFailed | FunctionNotFound | LogsFailed | LogsForbidden> {
		return this.requireRow(id).andThen((row) =>
			fromPromise(
				driver.logs(scriptName(row.name), Date.now() - hours * 60 * 60 * 1000),
				(error) =>
					error instanceof PlatformError && (error.status === 401 || error.status === 403)
						? this.error(18011, 'LOGS_FORBIDDEN', error)
						: this.error(18010, 'LOGS_FAILED', error)
			)
		);
	}

	/**
	 * The function with this name as the public API needs it: whether callers must be signed in.
	 * `null` when it doesn't exist or isn't deployed.
	 */
	findPublic(name: string): ResultAsync<{ requireAuth: boolean } | null, QueryFailed> {
		return this.findRow(name).map((row) => (row?.url ? { requireAuth: row.requireAuth } : null));
	}

	/**
	 * Forwards a request to the function's Worker, as `user` (or anonymously), and returns its
	 * response. Who may call the function is checked by the caller.
	 */
	invoke(
		name: string,
		request: Request,
		path: string,
		user: AppUser | null
	): ResultAsync<Response, QueryFailed | FunctionNotFound | NotDeployed | InvokeFailed> {
		return this.findRow(name)
			.andThen((row) => {
				if (!row) {
					return errAsync(this.error(18001, 'FUNCTION_NOT_FOUND'));
				}

				return row.url ? okAsync(row) : errAsync(this.error(18009, 'FUNCTION_NOT_DEPLOYED'));
			})
			.andThen((row) => {
				const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

				return fromPromise(
					fetch(this.workerRequest(row, path, request.method, request.headers, user), {
						body: hasBody ? request.body : null,
						// Node's fetch needs this for a streamed body.
						...(hasBody ? { duplex: 'half' } : {})
					} as RequestInit),
					(error): InvokeFailed => ({
						...this.error(18012, 'INVOKE_FAILED', error),
						data: { reason: reason(error) }
					})
				);
			});
	}

	/** Sends a request from the test panel, without a user, and reads the whole response. */
	test(
		id: string,
		input: FunctionRequest
	): ResultAsync<FunctionResponse, QueryFailed | FunctionNotFound | NotDeployed | InvokeFailed> {
		return this.requireDeployed(id).andThen((row) =>
			fromPromise(
				(async (): Promise<FunctionResponse> => {
					const started = performance.now();
					const response = await fetch(
						this.workerRequest(row, input.path, input.method, new Headers(input.headers), null),
						{
							body: input.method === 'GET' || input.method === 'HEAD' ? null : input.body,
							signal: AbortSignal.timeout(TEST_TIMEOUT)
						}
					);
					const body = await response.text();

					return {
						status: response.status,
						statusText: response.statusText,
						headers: [...response.headers],
						body: body.slice(0, MAX_TEST_BODY),
						truncated: body.length > MAX_TEST_BODY,
						durationMs: Math.round(performance.now() - started)
					};
				})(),
				(error): InvokeFailed => ({
					...this.error(18012, 'INVOKE_FAILED', error),
					data: {
						reason:
							error instanceof Error && error.name === 'TimeoutError'
								? `No response within ${TEST_TIMEOUT / 1000} seconds`
								: reason(error)
					}
				})
			)
		);
	}

	/** The request to the Worker: the path below its URL, with the secret and the user. */
	private workerRequest(
		row: FunctionRow,
		path: string,
		method: string,
		incoming: Headers,
		user: AppUser | null
	) {
		const url = new URL(path.startsWith('/') ? path : `/${path}`, row.url!);
		const headers = new Headers(incoming);

		for (const header of STRIPPED_HEADERS) {
			headers.delete(header);
		}

		headers.set(SECRET_HEADER, row.secret);

		if (user) {
			headers.set(USER_HEADER, headerJson(user));
		}

		return new Request(url, { method, headers, redirect: 'manual' });
	}

	/** Uploads the code to the Worker and stores it as the next version. */
	private deployCode(
		row: FunctionRow,
		code: FunctionCode
	): ResultAsync<typeof functionVersions.$inferSelect, DeployError> {
		const compiled = code.language === 'typescript' ? (code.compiled ?? null) : null;
		const script = scriptName(row.name);

		if (byteLength(code.source) + byteLength(compiled ?? '') > MAX_CODE_SIZE) {
			return errAsync(this.error(18003, 'CODE_TOO_LARGE'));
		}

		if (code.language === 'typescript' && compiled === null) {
			return errAsync({
				...this.error(18005, 'DEPLOY_FAILED'),
				data: { reason: 'TypeScript code needs the compiled JavaScript' }
			});
		}

		const deployFailed = (error: unknown): DeployFailed => ({
			...this.error(18005, 'DEPLOY_FAILED', error),
			data: { reason: reason(error) }
		});

		return fromPromise(driver.subdomain(), deployFailed)
			.andThen((subdomain) =>
				subdomain ? okAsync(subdomain) : errAsync(this.error(18004, 'NO_WORKERS_SUBDOMAIN'))
			)
			.andThen((subdomain) =>
				fromPromise(
					this.db
						.select({ number: max(functionVersions.number) })
						.from(functionVersions)
						.where(eq(functionVersions.functionId, row.id)),
					(error) => this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
				).map(([latest]) => ({ subdomain, number: (latest?.number ?? 0) + 1 }))
			)
			.andThen(({ subdomain, number }) =>
				this.services
					.apiKeys()
					.issueFunctionKey(row.id, row.name)
					.map((apiKey) => ({ subdomain, number, apiKey }))
			)
			.andThen(({ subdomain, number, apiKey }) =>
				fromPromise(
					(async () => {
						await driver.deploy(script, {
							mainModule: ENTRY_MODULE,
							modules: [
								{ name: ENTRY_MODULE, content: ENTRY_CODE },
								{ name: FUNCTION_MODULE, content: compiled ?? code.source }
							],
							bindings: [
								{ type: 'plain_text', name: 'POUCHBASE_URL', text: this.ctx.url.origin },
								{ type: 'secret_text', name: 'POUCHBASE_FUNCTION_SECRET', text: row.secret },
								{ type: 'secret_text', name: 'POUCHBASE_API_KEY', text: apiKey.key }
							],
							message: `Pouchbase version ${number}`
						});

						if (!row.url) {
							await driver.enableSubdomain(script);
						}
					})(),
					deployFailed
				)
					// The key of a version that didn't deploy is of no use.
					.orElse((error) =>
						this.services
							.apiKeys()
							.deleteFunctionKey(apiKey.id)
							.andThen(() => errAsync(error))
					)
					.map(() => ({ url: `https://${script}.${subdomain}.workers.dev`, number, apiKey }))
			)
			.andThen(({ url, number, apiKey }) =>
				fromPromise(
					(async () => {
						const now = new Date();
						const [version] = await this.db.batch([
							this.db
								.insert(functionVersions)
								.values({
									functionId: row.id,
									number,
									language: code.language,
									source: code.source,
									compiled,
									createdAt: now
								})
								.returning(),
							this.db.update(functions).set({ url, updatedAt: now }).where(eq(functions.id, row.id))
						]);

						row.url = url;
						row.updatedAt = now;

						return version[0];
					})(),
					(error) => this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
				).andThen((version) =>
					// The new version runs with the new key, so the older keys stop working.
					this.services
						.apiKeys()
						.keepFunctionKey(row.id, apiKey.id)
						.orElse((error) => {
							console.error(`[functions] could not remove old API keys of ${row.name}`, error);

							return okAsync(undefined);
						})
						.map(() => version)
				)
			);
	}

	private findRow(name: string): ResultAsync<FunctionRow | null, QueryFailed> {
		return fromPromise(this.db.select().from(functions).where(eq(functions.name, name)), (error) =>
			this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
		).map(([row]) => row ?? null);
	}

	private requireRow(id: string): ResultAsync<FunctionRow, QueryFailed | FunctionNotFound> {
		return fromPromise(this.db.select().from(functions).where(eq(functions.id, id)), (error) =>
			this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
		).andThen(([row]) => (row ? okAsync(row) : errAsync(this.error(18001, 'FUNCTION_NOT_FOUND'))));
	}

	private requireDeployed(
		id: string
	): ResultAsync<FunctionRow, QueryFailed | FunctionNotFound | NotDeployed> {
		return this.requireRow(id).andThen((row) =>
			row.url ? okAsync(row) : errAsync(this.error(18009, 'FUNCTION_NOT_DEPLOYED'))
		);
	}

	private latestVersion(functionId: string) {
		return fromPromise(
			this.db
				.select()
				.from(functionVersions)
				.where(eq(functionVersions.functionId, functionId))
				.orderBy(desc(functionVersions.number))
				.limit(1),
			(error) => this.error(18000, 'FUNCTIONS_QUERY_FAILED', error)
		).map(([version]) => version ?? null);
	}

	private versionInfo(version: typeof functionVersions.$inferSelect): FunctionVersion {
		return {
			id: version.id,
			number: version.number,
			language: version.language,
			size: byteLength(version.source),
			createdAt: version.createdAt
		};
	}

	private secretsError(error: unknown): SecretsFailed {
		return { ...this.error(18008, 'SECRETS_FAILED', error), data: { reason: reason(error) } };
	}
}
