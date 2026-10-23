# Pouchbase JS SDK

TypeScript client for the public API of [Pouchbase](https://github.com/pouchbase/pouchbase). It has no dependencies and runs wherever `fetch` exists: browsers, Node 20+, Deno, Bun and Cloudflare Workers.

> [!WARNING]
> Pouchbase is under active development. The API, and with it this SDK, may change without notice.

## Install

```sh
pnpm add @pouchbasejs/js-sdk
```

## Usage

```ts
import { createClient, isPouchbaseError, LocalAuthStore } from '@pouchbasejs/js-sdk';
import type { Schema } from './pouchbase'; // generated, see Types

const pb = createClient<Schema>('https://pouchbase.example.com', {
	// Keeps users signed in across reloads; the default store keeps the token in memory.
	authStore: new LocalAuthStore()
});

try {
	await pb.auth.signIn('ada@example.com', 'correct horse battery staple');
} catch (error) {
	if (isPouchbaseError(error, 'unauthorized')) {
		// Wrong username, email or password.
	}
}

const user = await pb.auth.me(); // UsersRecord | null, or null when signed out
const { items } = await pb.db.posts.findMany({ where: { status: 'published' } }); // PostsRecord[]
```

### Auth

| Method                                      | Request                                 |
| ------------------------------------------- | --------------------------------------- |
| `pb.auth.providers()`                       | `GET /api/auth/providers`               |
| `pb.auth.signUp({ username, password, … })` | `POST /api/auth/password/sign-up`       |
| `pb.auth.signIn(identity, password)`        | `POST /api/auth/password/sign-in`       |
| `pb.auth.signInWithOAuth(provider)`         | OAuth popup with PKCE, then polls       |
| `pb.auth.me()`                              | `GET /api/auth/me`                      |
| `pb.auth.signOut()`                         | Clears the auth store                   |
| `pb.auth.requestPasswordReset(email)`       | `POST /api/auth/password/request-reset` |
| `pb.auth.confirmPasswordReset(token, pass)` | `POST /api/auth/password/confirm-reset` |
| `pb.auth.requestVerification(email)`        | `POST /api/auth/verification/request`   |
| `pb.auth.confirmVerification(token)`        | `POST /api/auth/verification/confirm`   |

Sign-ins store the token in `pb.authStore`, which sends it as `Authorization: Bearer <token>` on later requests. Listen for changes with `pb.authStore.onChange((state) => …)`.

### OAuth

Call `signInWithOAuth` directly from a click handler, so the browser allows the popup:

```ts
button.addEventListener('click', async () => {
	try {
		await pb.auth.signInWithOAuth('github');
	} catch (error) {
		// error.code: access_denied, email_in_use, sign_in_failed, popup_blocked, popup_closed or timeout
	}
});
```

The token never appears in a URL: the SDK proves it started the sign-in with a secret PKCE verifier and collects the result itself. Outside the browser, pass `open: (url) => …` to open the sign-in page another way.

### Records

Every collection is a typed property of `pb.db`. With the generated `Schema`, field names, conditions, the sort order, selected fields, the values you send and the results are all checked by TypeScript:

```ts
// One page; conditions are objects, so values never need escaping.
const { items, total, hasMore } = await pb.db.posts.findMany({
	where: {
		status: 'published', // equals
		views: { gte: 10 }, // eq, not, in, notIn, gt, gte, lt, lte
		title: { contains: 'svelte' }, // contains, notContains
		tags: { has: 'news' }, // arrays: has, isEmpty
		$or: [{ author: user.id }, { featured: true }]
	},
	orderBy: { created_at: 'desc' },
	select: ['id', 'title'], // items: { id: string; title: string }[]
	limit: 20,
	page: 1
});

const post = await pb.db.posts.find(id); // PostsRecord | null
const draft = await pb.db.posts.findFirst({ where: { status: 'draft' } }); // or null
const count = await pb.db.posts.count({ status: 'published' });

// Every record, fetched page by page as you go
for await (const post of pb.db.posts.iterate({ orderBy: { title: 'asc' } })) {
	console.log(post.title);
}

const created = await pb.db.posts.insert({ title: 'Hello', published: true, tags: ['news'] });
await pb.db.posts.patch(created.id, { title: 'Hello again' }); // only these fields
await pb.db.posts.remove(created.id);
```

Records come back with real values: booleans are `boolean`, JSON fields are parsed, and multiple relations, files and lists are arrays. `insert()` takes the generated `PostsCreate` type: fields Pouchbase fills in (id, timestamps, computed fields) are left out and required fields are required.

**Hand-written filters.** For what `where` can't express, such as the signed-in user, write the filter with `filter` (the syntax of the API rules); values in `${…}` are escaped:

```ts
import { filter } from '@pouchbasejs/js-sdk';

await pb.db.posts.findMany({ where: filter`author = @request.auth.id || title ~ ${search}` });
```

**Without try/catch.** Every record call can return a result instead of throwing, which suits forms:

```ts
const result = await pb.db.posts.insert(values).safe();

if (!result.ok) {
	result.error.kind; // 'invalid', 'forbidden', 'conflict', …
	result.error.issues; // { title?: string; … }, typed by the fields of posts
}
```

What a caller may do depends on the collection's API rules in the Pouchbase admin: a locked rule fails with `forbidden`, and records a rule doesn't match are left out of lists and are "not found" otherwise (`null` from `find()`, `not_found` from `patch()` and `remove()`). The **API** panel of a collection shows these calls for its fields. Collections that aren't in your schema are reached with `pb.db.$collection('name')`.

### Files

```ts
pb.files.url(fileId); // https://pouchbase.example.com/api/files/<id>
pb.files.url(fileId, { thumb: '100x100' });
pb.files.url(fileId, { download: true });
```

### Functions

```ts
// POST /api/functions/hello with a JSON body; the signed-in user's token is sent along.
const { message } = await pb.functions.invoke<{ message: string }>('hello', {
	body: { name: 'Ada' }
});

// Another method, a path below the function and a query string.
await pb.functions.invoke('orders', { method: 'GET', path: '/42', query: { expand: 'items' } });
```

The body comes back as parsed JSON, or as text when it isn't JSON. A non-2xx answer throws a `PouchbaseError`.

### Types

The **Types** page of the Pouchbase admin shows TypeScript types for your collections and a URL to download them. Write them to a file, for example in a `postinstall` script or CI job:

```sh
npx @pouchbasejs/js-sdk types "https://pouchbase.example.com/api/types?token=…" --out src/pouchbase.ts
```

The URL can also come from `POUCHBASE_TYPES_URL`; without `--out` the types are printed. The file has a `<Name>Record` (what the API returns) and a `<Name>Create` (what to send) per collection, and a `Schema` with both. Pass it to the client:

```ts
import type { Schema } from './pouchbase';

const pb = createClient<Schema>('https://pouchbase.example.com');
const user = await pb.auth.me(); // UsersRecord | null
const post = await pb.db.posts.find('RECORD_ID'); // PostsRecord | null
```

`fetchTypes(url)` downloads the types from code.

### Errors

Every failed request throws a `PouchbaseError` with `kind` (`network`, `invalid`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `server` or `unknown`), `status` (`0` when the server wasn't reached), `message`, `issues` (validation messages per field, for `invalid` and `conflict`) and `code` (for OAuth). `isPouchbaseError(error, kind?)` checks for one, and `.safe()` on a record call returns it instead of throwing.

### Other requests

`pb.send(path, { method, body, query })` calls any API path with the stored token and the same error handling.

## Development

The SDK lives in the [Pouchbase repository](https://github.com/pouchbase/pouchbase) as `packages/js-sdk`. Install from the repository root, then run the scripts from this folder:

```sh
pnpm install
pnpm test       # Vitest
pnpm check      # TypeScript
pnpm lint       # Prettier and ESLint
pnpm build      # tsdown → dist/
```

The SDK follows the Pouchbase app at the repository root, which defines the API; see `AGENTS.md`.

## License

[MIT](LICENSE)
