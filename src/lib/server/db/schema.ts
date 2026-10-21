import type { FieldOptions, FieldType } from '../../fields/field-types';

import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	username: text('username').notNull().unique(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const sessions = sqliteTable('sessions', {
	/** SHA-256 hash of the token stored in the cookie. */
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

/** Collections of the app; each one is a table in the app database. */
export const collections = sqliteTable('collections', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	/** Also the table name in the app database. */
	name: text('name').notNull().unique(),
	/** Built-in collections (like `users`) can't be renamed or deleted. */
	system: integer('system', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** Fields (columns) of a collection. */
export const fields = sqliteTable(
	'fields',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		collectionId: text('collection_id')
			.notNull()
			.references(() => collections.id, { onDelete: 'cascade' }),
		/** Also the column name in the collection's table. */
		name: text('name').notNull(),
		type: text('type').$type<FieldType>().notNull(),
		required: integer('required', { mode: 'boolean' }).notNull().default(false),
		unique: integer('unique', { mode: 'boolean' }).notNull().default(false),
		/** Default value as entered in the form; the column DEFAULT is derived from it. */
		defaultValue: text('default_value'),
		options: text('options', { mode: 'json' }).$type<FieldOptions>().notNull().default({}),
		/** Fields of built-in collections (like `users.email`) can't be renamed or deleted. */
		system: integer('system', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('fields_collection_name_unique').on(table.collectionId, table.name)]
);

/** OAuth providers app users can sign in with. */
export const oauthProviders = sqliteTable('oauth_providers', {
	/** Provider key, e.g. `github`. */
	provider: text('provider').primaryKey(),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
	clientId: text('client_id').notNull().default(''),
	clientSecret: text('client_secret').notNull().default(''),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/**
 * A pending OAuth sign-in of an app user (popup flow, like PocketBase). The app proves it started
 * the sign-in with its own PKCE verifier before it receives the token.
 */
export const oauthRequests = sqliteTable('oauth_requests', {
	/** `state` sent to the provider. */
	id: text('id').primaryKey(),
	provider: text('provider').notNull(),
	/** State chosen by the app; it polls for the result with it. */
	clientState: text('client_state').notNull().unique(),
	/** S256 challenge of the app's verifier. */
	clientChallenge: text('client_challenge').notNull(),
	/** PKCE verifier between Pouchbase and the provider. */
	providerVerifier: text('provider_verifier').notNull(),
	status: text('status', { enum: ['pending', 'done', 'error'] })
		.notNull()
		.default('pending'),
	token: text('token'),
	userId: text('user_id'),
	error: text('error'),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

export type User = typeof users.$inferSelect;
