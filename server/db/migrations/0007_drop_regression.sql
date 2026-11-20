DELETE FROM `alerts` WHERE `kind` = 'regression';--> statement-breakpoint
ALTER TABLE `alerts` DROP COLUMN `baseline`;
