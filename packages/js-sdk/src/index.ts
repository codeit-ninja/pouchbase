export { createClient, Pouchbase } from './client.js';
export type { PouchbaseOptions, RequestOptions } from './client.js';
export { AuthStore, LocalAuthStore } from './auth-store.js';
export type { AuthChangeListener, AuthState } from './auth-store.js';
export { isPouchbaseError, PouchbaseError } from './error.js';
export type { ErrorKind, Pending, Result } from './error.js';
export { decodeToken, isTokenValid } from './jwt.js';
export { AuthService } from './services/auth.js';
export type { OAuthOptions } from './services/auth.js';
export { FilesService } from './services/files.js';
export type { FileUrlOptions } from './services/files.js';
export { FunctionsService } from './services/functions.js';
export type { InvokeOptions } from './services/functions.js';
export { CollectionClient } from './services/db.js';
export type {
	AnyRecord,
	CallOptions,
	CreateOf,
	Db,
	FindFirstOptions,
	FindManyOptions,
	IterateOptions,
	Page,
	RecordOf,
	SelectOptions
} from './services/db.js';
export { filter } from './query.js';
export type {
	FieldCondition,
	FieldName,
	Filter,
	FilterValue,
	JsonValue,
	OrderBy,
	Selected,
	Where
} from './query.js';
export { fetchTypes } from './typegen.js';
export type { FetchTypesOptions } from './typegen.js';
export { OAUTH_PROVIDERS } from './types.js';
export type {
	AuthResult,
	DefaultCollections,
	Issues,
	OAuthProvider,
	OAuthProviderInfo,
	SignUpInput,
	User,
	UserOf
} from './types.js';
