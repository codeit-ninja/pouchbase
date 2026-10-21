CREATE TABLE `oauth_providers` (
	`provider` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`client_id` text DEFAULT '' NOT NULL,
	`client_secret` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `collections` ADD `system` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `fields` ADD `system` integer DEFAULT false NOT NULL;