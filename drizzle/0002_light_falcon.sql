CREATE TABLE `fields` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`unique` integer DEFAULT false NOT NULL,
	`default_value` text,
	`options` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fields_collection_name_unique` ON `fields` (`collection_id`,`name`);