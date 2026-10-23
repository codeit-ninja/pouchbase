import type {
	getFunction,
	getFunctionLogs,
	getFunctionVersions,
	testFunction
} from './functions.remote';

/** A function as its page shows it (see `getFunction`). */
export type FunctionData = Awaited<ReturnType<typeof getFunction>>;

export type FunctionVersion = Awaited<ReturnType<typeof getFunctionVersions>>[number];

export type FunctionLog = Awaited<ReturnType<typeof getFunctionLogs>>['logs'][number];

export type FunctionResponse = Awaited<ReturnType<typeof testFunction>>;
