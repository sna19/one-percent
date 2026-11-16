ALTER TABLE `goals` ADD `image_kind` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `image_value` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `goals` SET `image_value` = substr(trim(`title`), 1, 2) WHERE `image_value` = '';
