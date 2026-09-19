CREATE TABLE `integration_config` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` text NOT NULL,
	`enabled` integer NOT NULL,
	`ciphertext` text
);
--> statement-breakpoint
