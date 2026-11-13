ALTER TABLE `page_checks` ADD `a11y_issues` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `page_checks` ADD `a11y_elements` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- CrUX CLS used to be stored x100 (as PSI reports it); now unitless like the lab value
UPDATE `page_results` SET `field_cls` = `field_cls` / 100.0 WHERE `field_cls` IS NOT NULL;
