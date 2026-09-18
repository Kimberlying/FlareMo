-- Rebuilding `tasks` fires the `task_activity.task_id` ON DELETE CASCADE in
-- D1. Preserve the linked activity rows explicitly; project-level activity
-- with a NULL task_id is unaffected by the table replacement.
CREATE TABLE `__temp_task_activity_0025` AS
SELECT
	`id`,
	`task_id`,
	`user_id`,
	`actor_type`,
	`actor_name`,
	`action`,
	`changes`,
	`created_at`
FROM `task_activity`
WHERE `task_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`source_memo_id` text,
	`title` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'none' NOT NULL,
	`due_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "user_id", "project_id", "title", "notes", "status", "priority", "due_at", "sort_order", "completed_at", "created_at", "updated_at") SELECT "id", "user_id", "project_id", "title", "notes", "status", "priority", "due_at", "sort_order", "completed_at", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
INSERT INTO `task_activity` (
	`id`,
	`task_id`,
	`user_id`,
	`actor_type`,
	`actor_name`,
	`action`,
	`changes`,
	`created_at`
)
SELECT
	`id`,
	`task_id`,
	`user_id`,
	`actor_type`,
	`actor_name`,
	`action`,
	`changes`,
	`created_at`
FROM `__temp_task_activity_0025`;--> statement-breakpoint
DROP TABLE `__temp_task_activity_0025`;--> statement-breakpoint
CREATE INDEX `tasks_user_project_status_sort_idx` ON `tasks` (`user_id`,`project_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE INDEX `tasks_user_due_idx` ON `tasks` (`user_id`,`due_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `deleted_at` text;
