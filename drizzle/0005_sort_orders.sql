ALTER TABLE `categories` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `plan_templates` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `categories` SET `sort_order` = `id`;--> statement-breakpoint
UPDATE `goals` SET `sort_order` = `id`;--> statement-breakpoint
UPDATE `plan_templates` SET `sort_order` = `id`;
