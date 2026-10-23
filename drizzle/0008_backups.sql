CREATE TABLE `backup_destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`endpoint` text NOT NULL,
	`region` text NOT NULL,
	`bucket` text NOT NULL,
	`access_key_id` text NOT NULL,
	`secret_access_key` text NOT NULL,
	`path_style` integer DEFAULT false NOT NULL,
	`prefix` text DEFAULT 'pouchbase' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `backup_files` (
	`destination_id` text NOT NULL,
	`key` text NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `backup_destinations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_files_destination_key_unique` ON `backup_files` (`destination_id`,`key`);--> statement-breakpoint
CREATE TABLE `backup_restores` (
	`id` text PRIMARY KEY NOT NULL,
	`backup_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`include_files` integer DEFAULT false NOT NULL,
	`files` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT '{}' NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`backup_id`) REFERENCES `backups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `backup_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text NOT NULL,
	`cron` text NOT NULL,
	`include_files` integer DEFAULT false NOT NULL,
	`keep` integer DEFAULT 7 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `backup_destinations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text NOT NULL,
	`schedule_id` text,
	`key` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`include_files` integer DEFAULT false NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`files` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT '{}' NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`destination_id`) REFERENCES `backup_destinations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `backup_schedules`(`id`) ON UPDATE no action ON DELETE set null
);
