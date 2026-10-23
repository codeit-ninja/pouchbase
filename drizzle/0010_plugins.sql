CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`api_version` integer NOT NULL,
	`manifest` text NOT NULL,
	`bundle` text NOT NULL,
	`integrity` text NOT NULL,
	`registry_url` text NOT NULL,
	`installed_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
