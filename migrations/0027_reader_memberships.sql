ALTER TABLE `auth_members` ADD `expires_at` INTEGER;--> statement-breakpoint
DROP INDEX IF EXISTS `auth_members_expires_sweep_idx`;
CREATE INDEX `auth_members_expires_sweep_idx` ON `auth_members` (`expires_at`);
