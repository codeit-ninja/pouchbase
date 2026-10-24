CREATE TABLE `plugin_auth_providers` (
	`provider` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`label` text NOT NULL,
	`console_url` text,
	`icon` text,
	`authorize_url` text NOT NULL,
	`token_url` text NOT NULL,
	`scopes` text NOT NULL,
	`pkce` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `plugins` ADD `worker_url` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `worker_secret` text;