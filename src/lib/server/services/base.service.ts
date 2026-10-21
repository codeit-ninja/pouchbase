import type { RequestEvent } from '@sveltejs/kit';
import type { ResultAsync } from 'neverthrow';

import { getRequestEvent } from '$app/server';

import { CloudflareApiError } from '../cloudflare/d1';
import { db } from '../db';

/** The error union of a service method, e.g. `ErrorOf<ReturnType<FieldsService['create']>>`. */
export type ErrorOf<T> = T extends ResultAsync<unknown, infer E> ? E : never;

export type ServiceError<Code extends number, Message extends string> = {
	code: Code;
	message: Message;
	data?: unknown;
};

export class Service {
	protected readonly ctx: RequestEvent;

	constructor() {
		this.ctx = getRequestEvent();
	}

	/**
	 * Generically format an error object
	 *
	 * @param code - Give this a unique number, to reference the error
	 * @param message - A human readable message
	 * @param error - The original error, if any
	 * @returns
	 */
	error<Code extends number, Message extends string>(
		code: Code,
		message: Message,
		error?: unknown
	): ServiceError<Code, Message> {
		return {
			code,
			message,
			data:
				error instanceof CloudflareApiError
					? { status: error.status, errors: error.errors }
					: error instanceof Error && error.cause instanceof CloudflareApiError
						? { status: error.cause.status, errors: error.cause.errors }
						: undefined
		};
	}

	/**
	 * Get the Drizzle database (D1 over the Cloudflare HTTP API)
	 *
	 * @returns The database instance
	 */
	protected get db() {
		return db;
	}

	/**
	 * Get the service registry, for services that build on other services
	 *
	 * @returns The services registry from the request event
	 */
	protected get services() {
		return this.ctx.locals.services;
	}
}
