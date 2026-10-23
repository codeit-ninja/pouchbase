DROP INDEX `users_username_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `username`;--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'app_name';
