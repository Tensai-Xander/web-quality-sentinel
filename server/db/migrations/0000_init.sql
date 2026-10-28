CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`page_result_id` integer,
	`page_id` text NOT NULL,
	`url` text NOT NULL,
	`strategy` text NOT NULL,
	`metric` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`actual` real,
	`limit` real,
	`baseline` real,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_result_id`) REFERENCES `page_results`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alerts_run_idx` ON `alerts` (`run_id`);--> statement-breakpoint
CREATE TABLE `page_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`page_id` text NOT NULL,
	`url` text NOT NULL,
	`strategy` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`performance` real,
	`accessibility` real,
	`best_practices` real,
	`seo` real,
	`lcp` real,
	`cls` real,
	`tbt` real,
	`fcp` real,
	`si` real,
	`ttfb` real,
	`field_inp` real,
	`field_lcp` real,
	`field_cls` real,
	`samples` integer DEFAULT 0 NOT NULL,
	`lighthouse_version` text,
	`details` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `page_results_run_idx` ON `page_results` (`run_id`);--> statement-breakpoint
CREATE INDEX `page_results_page_idx` ON `page_results` (`page_id`,`strategy`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger` text NOT NULL,
	`release_tag` text,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`error` text,
	`checks_total` integer DEFAULT 0 NOT NULL,
	`checks_done` integer DEFAULT 0 NOT NULL
);
