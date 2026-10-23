import type { getInstalledPlugins } from './plugins.remote';

export type InstalledPlugin = Awaited<ReturnType<typeof getInstalledPlugins>>[number];
