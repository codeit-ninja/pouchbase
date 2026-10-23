import type { getApiKeys } from './api-keys.remote';

export type ApiKey = Awaited<ReturnType<typeof getApiKeys>>[number];
