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
import { LocalAuthStore, Pouchbase, PouchbaseError } from '@pouchbasejs/js-sdk';

const pb = new Pouchbase('https://pouchbase.example.com', {
	// Keeps users signed in across reloads; the default store keeps the token in memory.
	authStore: new LocalAuthStore()
});

try {
	await pb.auth.signIn('ada@example.com', 'correct horse battery staple');
} catch (error) {
	if (error instanceof PouchbaseError && error.status === 401) {
		// Wrong username, email or password.
	}
}

const user = await pb.auth.me(); // null when signed out or the token expired
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

```ts
const posts = pb.collection('posts');

// One page; `filter` and `sort` use the syntax of the API rules.
const { items, totalItems, totalPages } = await posts.getList(1, 20, {
	filter: 'status = "published"',
	sort: '-created_at'
});

const all = await posts.getFullList({ sort: 'title' }); // every page
const post = await posts.getFirstListItem(pb.filter('slug = {:slug}', { slug })); // or null
const one = await posts.getOne('RECORD_ID'); // or null

const created = await posts.create({ title: 'Hello', published: true, tags: ['news'] });
const updated = await posts.update(created.id, { title: 'Hello again' }); // only these fields
await posts.delete(created.id);
```

What a caller may do depends on the collection's API rules in the Pouchbase admin: a locked rule throws a `PouchbaseError` with status `403`, and records a rule doesn't match are left out of lists and are "not found" otherwise (`null` from `getOne()`, `404` from `update()` and `delete()`). Invalid values throw `400` with `issues` per field.

Build filters with values from users through `pb.filter()`, which quotes and escapes them: `pb.filter('title ~ {:search} && views > {:min}', { search, min: 10 })`. The **API** panel of a collection in the admin shows these calls for its fields.

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

The URL can also come from `POUCHBASE_TYPES_URL`; without `--out` the types are printed. Pass the generated `Collections` to the client to type your records:

```ts
import type { Collections } from './pouchbase';

const pb = new Pouchbase<Collections>('https://pouchbase.example.com');
const user = await pb.auth.me(); // UsersRecord | null
const post = await pb.collection('posts').getOne('RECORD_ID'); // PostsRecord | null
```

Values are typed as the API returns them: booleans are `0 | 1`, JSON fields and multiple relations are JSON text. `fetchTypes(url)` downloads the types from code.

### Errors

Every failed request throws a `PouchbaseError` with `status` (`0` when the server wasn't reached), `message`, `issues` (validation messages per field, for `400` and `409`) and `code` (for OAuth).

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
