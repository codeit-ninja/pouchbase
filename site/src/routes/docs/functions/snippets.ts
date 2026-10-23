import { snippet } from '#lib/highlight.js';

export const handler = snippet(
	'typescript',
	`
/** Variables and secrets of this function (Secrets tab). */
interface Env {
	/** URL of this Pouchbase installation. */
	POUCHBASE_URL: string;
	STRIPE_KEY: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// The signed-in app user, when the request has a valid token; otherwise null.
		const user = pouchbaseUser(request);
		const { searchParams } = new URL(request.url);
		const name = searchParams.get('name') ?? user?.email ?? 'world';

		return Response.json({ message: \`Hello \${name}!\` });
	}
};`
);

export const bundle = snippet(
	'bash',
	`
npx esbuild src/my-function.ts --bundle --format=esm --outfile=dist/my-function.js`
);

export const invoke = snippet(
	'typescript',
	`
// POST /api/functions/hello with a JSON body; the signed-in user's token is sent along.
const { message } = await pb.functions.invoke<{ message: string }>('hello', {
	body: { name: 'Ada' }
});

// Another method, a path below the function and a query string.
await pb.functions.invoke('orders', { method: 'GET', path: '/42', query: { expand: 'items' } });`
);

export const curl = snippet(
	'bash',
	`
curl -X POST https://pouchbase.example.com/api/functions/hello \\
	-H "Authorization: Bearer $TOKEN" \\
	-H "Content-Type: application/json" \\
	-d '{"name":"Ada"}'`
);
