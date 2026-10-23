CREATE TABLE `deploy_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deploy_tokens_token_hash_unique` ON `deploy_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text,
	`source` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`steps` text NOT NULL,
	`warnings` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`backup_id` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`token_id`) REFERENCES `deploy_tokens`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`backup_id`) REFERENCES `backups`(`id`) ON UPDATE no action ON DELETE set null
);
