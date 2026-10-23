/**
 * Serverless functions, shared by the Functions pages and the server: naming rules, the starter
 * code and what the code can use. Every function runs as a Worker of its own on Cloudflare and is
 * called through `/api/functions/<name>`.
 */

export const FUNCTION_LANGUAGES = ['typescript', 'javascript'] as const;

export type FunctionLanguage = (typeof FUNCTION_LANGUAGES)[number];

/** Lowercase letters, digits and dashes, not at the ends: part of a URL and a Worker's name. */
export const FUNCTION_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * The Worker's name is `<instance>-fn-<name>` (an instance name has at most 19 characters), and a
 * workers.dev label has at most 63 characters.
 */
export const FUNCTION_NAME_MAX_LENGTH = 40;

/** Upper-case letters, digits and underscores, starting with a letter or underscore. */
export const SECRET_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

/** Variables Pouchbase sets itself; secrets can't use these names. */
export const RESERVED_ENV_NAMES = [
	'POUCHBASE_URL',
	'POUCHBASE_FUNCTION_SECRET',
	'POUCHBASE_API_KEY'
];

/** Most code a version may have (source and compiled JavaScript together), in bytes. */
export const MAX_CODE_SIZE = 1024 * 1024;

/** Request header with the signed-in app user as JSON (only ASCII: other characters are escaped). */
export const USER_HEADER = 'x-pouchbase-user';

/** Methods the test panel can send. */
export const TEST_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** The language of an uploaded file, from its name; `null` when it isn't JavaScript or TypeScript. */
export function languageOf(fileName: string): FunctionLanguage | null {
	if (/\.(?:ts|mts)$/i.test(fileName)) {
		return 'typescript';
	}

	return /\.(?:js|mjs)$/i.test(fileName) ? 'javascript' : null;
}

const TYPESCRIPT_TEMPLATE = `/** Variables and secrets of this function (Secrets tab). */
interface Env {
	/** URL of this Pouchbase installation. */
	POUCHBASE_URL: string;
	/** API key of this function, e.g. to send email templates (pb.mail.send of the JS SDK). */
	POUCHBASE_API_KEY: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// The signed-in app user, when the request has a valid token; otherwise null.
		const user = pouchbaseUser(request);
		const { searchParams } = new URL(request.url);
		const name = searchParams.get('name') ?? user?.email ?? 'world';

		return Response.json({ message: \`Hello \${name}!\` });
	}
};
`;

const JAVASCRIPT_TEMPLATE = `export default {
	/**
	 * @param {Request} request
	 * @param {{ POUCHBASE_URL: string, POUCHBASE_API_KEY: string }} env Variables and secrets of this
	 *   function (Secrets tab); the API key can send email templates (pb.mail.send of the JS SDK).
	 */
	async fetch(request, env) {
		// The signed-in app user, when the request has a valid token; otherwise null.
		const user = pouchbaseUser(request);
		const { searchParams } = new URL(request.url);
		const name = searchParams.get('name') ?? user?.email ?? 'world';

		return Response.json({ message: \`Hello \${name}!\` });
	}
};
`;

/** The code a new function starts with. */
export function functionTemplate(language: FunctionLanguage) {
	return language === 'typescript' ? TYPESCRIPT_TEMPLATE : JAVASCRIPT_TEMPLATE;
}

/**
 * Declarations for the editor: the parts of the Workers runtime that functions use most, and the
 * `pouchbaseUser` helper that the Worker defines around the function's code.
 */
export const FUNCTION_TYPINGS = `
interface ExecutionContext {
	/** Keeps the Worker running until the promise settles, after the response was sent. */
	waitUntil(promise: Promise<unknown>): void;
	passThroughOnException(): void;
}

/** An app user, as \`GET /api/auth/me\` returns it. */
interface PouchbaseUser {
	id: string;
	email: string;
	[field: string]: unknown;
}

/**
 * The app user who called the function, from the token in the \`Authorization\` header; \`null\`
 * when the request has no valid token. Pouchbase checks the token before the request gets here.
 */
declare function pouchbaseUser(request: Request): PouchbaseUser | null;
`;

/** Libraries of the editor: the Workers runtime has \`fetch\`, \`Request\` and friends, not the DOM. */
export const FUNCTION_LIBS = ['es2022', 'webworker'];
