CREATE TABLE `page_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`page_id` text NOT NULL,
	`url` text NOT NULL,
	`final_url` text,
	`status` text NOT NULL,
	`error` text,
	`http_status` integer,
	`js_errors` integer DEFAULT 0 NOT NULL,
	`failed_requests` integer DEFAULT 0 NOT NULL,
	`links_checked` integer DEFAULT 0 NOT NULL,
	`broken_links` integer DEFAULT 0 NOT NULL,
	`meta_issues` integer DEFAULT 0 NOT NULL,
	`jsonld_count` integer DEFAULT 0 NOT NULL,
	`jsonld_issues` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`details` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `page_checks_run_idx` ON `page_checks` (`run_id`);