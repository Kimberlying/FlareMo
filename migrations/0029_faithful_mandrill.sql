CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`team_id` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`cover_attachment_id` text,
	`lang` text,
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `auth_organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_slug_idx` ON `articles` (`slug`);--> statement-breakpoint
CREATE INDEX `articles_user_status_updated_idx` ON `articles` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `articles_team_status_idx` ON `articles` (`team_id`,`status`);--> statement-breakpoint
CREATE INDEX `articles_published_idx` ON `articles` (`published_at`);--> statement-breakpoint
CREATE INDEX `articles_recycle_sweep_idx` ON `articles` (`deleted_at`) WHERE deleted_at is not null;--> statement-breakpoint
DROP INDEX `attachments_cleanup_idx`;--> statement-breakpoint
ALTER TABLE `attachments` ADD `article_id` text REFERENCES articles(id);--> statement-breakpoint
CREATE INDEX `attachments_article_idx` ON `attachments` (`article_id`);--> statement-breakpoint
CREATE INDEX `attachments_cleanup_idx` ON `attachments` (`created_at`) WHERE (state = 'deleting' or (memo_id is null and article_id is null));