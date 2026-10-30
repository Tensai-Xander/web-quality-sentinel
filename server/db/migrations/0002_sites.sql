ALTER TABLE `runs` ADD `site_id` text NOT NULL DEFAULT 'toyota-community';--> statement-breakpoint
CREATE INDEX `runs_site_idx` ON `runs` (`site_id`);