import type { getBackups } from './backups.remote';

/** What the Backups page shows (see `getBackups`). */
export type BackupsOverview = Awaited<ReturnType<typeof getBackups>>;

export type Destination = BackupsOverview['destinations'][number];

export type Schedule = BackupsOverview['schedules'][number];

export type Backup = BackupsOverview['backups'][number];

export type Restore = NonNullable<BackupsOverview['restore']>;
