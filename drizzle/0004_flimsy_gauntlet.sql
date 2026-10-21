CREATE TABLE `oauth_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`client_state` text NOT NULL,
	`client_challenge` text NOT NULL,
	`provider_verifier` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token` text,
	`user_id` text,
	`error` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_requests_client_state_unique` ON `oauth_requests` (`client_state`);