import { z } from 'zod';

import {
	FUNCTION_LANGUAGES,
	FUNCTION_NAME_MAX_LENGTH,
	FUNCTION_NAME_PATTERN,
	RESERVED_ENV_NAMES,
	SECRET_NAME_PATTERN,
	TEST_METHODS
} from '#lib/functions/functions.js';

const description = z
	.string()
	.trim()
	.max(500, 'Description must be at most 500 characters')
	.default('');

/** A new function (Functions page). */
export const createFunctionSchema = z.object({
	name: z
		.string()
		.trim()
		.toLowerCase()
		.min(1, 'Enter a name')
		.max(FUNCTION_NAME_MAX_LENGTH, `Name must be at most ${FUNCTION_NAME_MAX_LENGTH} characters`)
		.regex(FUNCTION_NAME_PATTERN, 'Use lowercase letters, digits and dashes, like send-email'),
	description,
	language: z.enum(FUNCTION_LANGUAGES),
	requireAuth: z.boolean().default(false)
});

/** Description and access of a function (Settings tab). */
export const functionSettingsSchema = z.object({
	id: z.string().min(1),
	description,
	requireAuth: z.boolean().default(false)
});

export const functionIdSchema = z.object({ id: z.string().min(1) });

/** Code to deploy; TypeScript comes with the JavaScript the editor compiled it to. */
export const deployFunctionSchema = z.object({
	id: z.string().min(1),
	language: z.enum(FUNCTION_LANGUAGES),
	source: z.string().min(1, 'The code is empty'),
	compiled: z.string().optional()
});

export const restoreFunctionVersionSchema = z.object({
	id: z.string().min(1),
	versionId: z.string().min(1)
});

export const functionVersionSchema = restoreFunctionVersionSchema;

/** A secret of a function (Secrets tab). */
export const functionSecretSchema = z.object({
	id: z.string().min(1),
	name: z
		.string()
		.trim()
		.min(1, 'Enter a name')
		.max(100, 'Name must be at most 100 characters')
		.regex(SECRET_NAME_PATTERN, 'Use upper-case letters, digits and underscores, like API_KEY')
		.refine((name) => !RESERVED_ENV_NAMES.includes(name), {
			message: 'Pouchbase sets this variable itself'
		}),
	/** Leading underscore: never sent back to the browser. */
	_value: z.string().min(1, 'Enter the value').max(5000, 'Value must be at most 5000 characters')
});

export const deleteFunctionSecretSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1)
});

export const functionLogsSchema = z.object({
	id: z.string().min(1),
	hours: z.union([z.literal(1), z.literal(6), z.literal(24), z.literal(72)])
});

/** A request from the test panel. */
export const testFunctionSchema = z.object({
	id: z.string().min(1),
	method: z.enum(TEST_METHODS),
	/** Path and query string after `/api/functions/<name>`. */
	path: z
		.string()
		.trim()
		.max(2000)
		.transform((path) => (path.startsWith('/') ? path : `/${path}`)),
	headers: z.record(z.string(), z.string()).default({}),
	body: z.string().max(1_000_000).nullable().default(null)
});
