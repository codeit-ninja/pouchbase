---
name: pouchbase-services
description: Project rules for server-side logic in Pouchbase. MUST be loaded before writing or changing anything in src/lib/server, a *.remote.ts file, a hook, +page.server.ts or +server.ts. Covers the services pattern (classes extending Service, the Services registry on locals), neverthrow ResultAsync return types, ServiceError codes, and how callers turn errors into error()/invalid()/redirect().
---

# Pouchbase services

All server-side business logic lives in **services**. Routes, remote functions and hooks never touch
the database, the Cloudflare API or crypto directly; they call a service and handle its `Result`.
(Same pattern as cuespark, `site/src/lib/server/services`.)

## Layout

```
src/lib/server/
├── cloudflare/d1.ts        # infrastructure: Cloudflare REST client, D1 over HTTP (throws).
│                           # `pouchbase` = system DB; the app DB has a random name (see settings)
├── db/                     # Drizzle schema, client and migrator (throws)
├── crypto.ts               # password hashing, tokens (throws)
├── hooks/                  # boot.ts, session.ts, guard.ts → sequence() in src/hooks.server.ts
└── services/
    ├── auth.service.ts
    ├── base.service.ts     # ServiceError type + Service base class
    ├── services.ts         # Services registry (one method per service)
    ├── collections.service.ts
    ├── database.service.ts
    ├── fields.service.ts
    ├── indexes.service.ts
    ├── install.service.ts
    ├── oauth-providers.service.ts
    ├── records.service.ts
    ├── sessions.service.ts
    ├── settings.service.ts
    └── users.service.ts
```

Infrastructure modules (`cloudflare/`, `db/`, `crypto.ts`) are plain functions that **throw**.
Services are the boundary where throwing code is wrapped into `ResultAsync`.

## Writing a service

- File: `src/lib/server/services/<plural-domain>.service.ts`, class `<Domain>Service extends Service`.
- Register it in `services.ts` with a method that returns a new instance:

  ```ts
  export class Services {
  	users() {
  		return new UsersService();
  	}
  }
  ```

- `Service` reads the current request via `getRequestEvent()` in its constructor and exposes:
  - `this.ctx` — the `RequestEvent` (cookies, locals, url, ...)
  - `this.db` — the Drizzle database
  - `this.services` — the registry, for services that build on other services
  - `this.error(code, message, error?)` — builds a `ServiceError`
- Pure helpers go as non-exported functions above the class; multi-step private logic as `private`
  methods.
- Import order: type imports, external packages, `$app`/`#lib` imports, relative imports.

## neverthrow rules

- **Every public method returns `ResultAsync<T, ServiceError<Code, 'MESSAGE'>>`** with an explicit
  return type annotation. Import `ResultAsync` as a type: `import type { ResultAsync } from 'neverthrow'`.
- Wrap every throwing call with `fromPromise(promise, (error) => this.error(code, 'MESSAGE', error))`.
  Multi-step async work goes in an `(async () => { ... })()` IIFE inside `fromPromise`.
- Transform with `.map(...)`, chain with `.andThen(...)`, short-circuit with
  `errAsync(this.error(...))`, return plain values in a chain with `okAsync(value)`.
- **Not found is `Ok(null)`**, not an error. The caller decides whether that is a 404.
- Expected failures that the caller must react to get their own code (e.g. `INVALID_CREDENTIALS`,
  `ACCOUNT_ALREADY_EXISTS`); a method that can fail in several ways declares a union of
  `ServiceError`s. Methods that compose other services include those services' errors in the union.
- Never use `_unsafeUnwrap` outside tests, and never throw from inside a service method.

## ServiceError codes

`{ code: number; message: 'UPPER_SNAKE_CASE'; data?: unknown }`. Codes are **unique across the
app**; each service owns a range:

| Range | Service    |
| ----- | ---------- |
| 1000  | database   |
| 2000  | install    |
| 3000  | users      |
| 4000  | sessions   |
| 5000  | settings   |
| 6000  | collections |
| 7000  | fields      |
| 8000  | records     |
| 9000  | indexes     |
| 10000 | oauth providers |
| 11000 | auth (app users) |

A new service takes the next free range (6000, 7000, ...). Never reuse a code.

## Calling services

Always go through `locals.services` (in remote functions: `getRequestEvent().locals.services`).
`await` the result, check `isErr()`, map the error explicitly, then use `result.value`:

```ts
export const login = form(loginSchema, async (data) => {
	const { locals } = getRequestEvent();

	const result = await locals.services.sessions().login(data.username, data._password);

	if (result.isErr()) {
		if (result.error.code === 4003) {
			invalid('Invalid username or password');
		}

		error(500, result.error.message);
	}

	redirect(303, '/');
});
```

- Validation-type failures → `invalid(...)` (form-level) or `invalid(issue.field('...'))`.
- Forbidden/conflict states → `error(403, '...')`, not found (`Ok(null)`) → `error(404, '...')`.
- Anything unexpected → `error(500, result.error.message)`.
- `error()` and `redirect()` are called without `throw` (SvelteKit 3 style).
- User-facing messages are written in the caller, in English; the `UPPER_SNAKE` message is for logs.
