/**
 * The platform drivers in use: D1, R2 and the function Workers through the Cloudflare REST API, on
 * Workers and on Node alike. Uploaded files can instead go to an S3-compatible bucket configured on
 * the Storage page. Nothing else imports a driver directly.
 */
export { database, functions, insights, storage } from './cloudflare';
export { createS3Storage, type S3Config } from './s3/storage';
export { PlatformError } from './types';
export type {
	DatabaseDriver,
	DatabaseInfo,
	FunctionBinding,
	FunctionLog,
	FunctionModule,
	FunctionsDriver,
	FunctionUpload,
	InsightsDriver,
	InsightsInput,
	ObjectStore,
	QueryResult,
	SqlExport,
	SqlImport,
	Statement,
	StorageDriver
} from './types';
