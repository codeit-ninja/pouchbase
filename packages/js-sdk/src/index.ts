export { createClient, Pouchbase } from './client.js';
export type { PouchbaseOptions, RequestOptions } from './client.js';
export { AuthStore, LocalAuthStore } from './auth-store.js';
export type { AuthChangeListener, AuthState } from './auth-store.js';
export { isPouchbaseError, PouchbaseError } from './error.js';
export type { ErrorKind, Pending, Result } from './error.js';
export { decodeToken, isTokenValid } from './jwt.js';
export { AuthService } from './services/auth.js';
export type { OAuthOptions } from './services/auth.js';
export { CollectionsService } from './services/collections.js';
export type {
	ApiRules,
	CollectionExport,
	CollectionField,
	CollectionIndex,
	CollectionSchema,
	CreateCollectionInput,
	FieldInput,
	FieldOptions,
	FieldType,
	ImportOptions,
	ImportPlan,
	IndexInput,
	Severity,
	ThumbnailSettings,
	UpdateCollectionInput
} from './services/collections.js';
export { FilesService } from './services/files.js';
export type { FileUrlOptions } from './services/files.js';
export { FunctionsService } from './services/functions.js';
export type { InvokeOptions } from './services/functions.js';
export { MailService } from './services/mail.js';
export type { SendMailOptions } from './services/mail.js';
export { CollectionClient } from './services/db.js';
export { RealtimeService } from './services/realtime.js';
export type { SubscribeOptions } from './services/realtime.js';
export { RealtimeConnection } from './realtime/connection.js';
export type {
	ConnectionState,
	RealtimeEvent,
	RealtimeSubscription,
	SubscriptionRequest,
	WebSocketInstance,
	WebSocketLike
} from './realtime/connection.js';
export type { RealtimeAction } from './realtime/protocol.js';
export type {
	AnyInclude,
	AnyRecord,
	AnyRelations,
	CallOptions,
	CollectionSubscribeOptions,
	CreateOf,
	Db,
	FindFirstOptions,
	FindManyOptions,
	Include,
	Included,
	IterateOptions,
	Page,
	RecordOf,
	RelationsOf,
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
export { KNOWN_OAUTH_PROVIDERS, OAUTH_PROVIDERS } from './types.js';
export type {
	AuthResult,
	DefaultCollections,
	Issues,
	KnownOAuthProvider,
	OAuthProvider,
	OAuthProviderInfo,
	SignUpInput,
	SignUpResult,
	User,
	UserOf
} from './types.js';
