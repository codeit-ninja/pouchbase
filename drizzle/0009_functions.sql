CREATE TABLE `function_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`function_id` text NOT NULL,
	`number` integer NOT NULL,
	`language` text NOT NULL,
	`source` text NOT NULL,
	`compiled` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`function_id`) REFERENCES `functions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `function_versions_function_number_unique` ON `function_versions` (`function_id`,`number`);--> statement-breakpoint
CREATE TABLE `functions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`require_auth` integer DEFAULT false NOT NULL,
	`secret` text NOT NULL,
	`url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `functions_name_unique` ON `functions` (`name`);