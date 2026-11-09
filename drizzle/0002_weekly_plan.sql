CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_plan_id` integer NOT NULL,
	`practice_id` integer NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`week_plan_id`) REFERENCES `week_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`practice_id`) REFERENCES `practices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_items_practice_date` ON `plan_items` (`practice_id`,`date`);--> statement-breakpoint
CREATE TABLE `plan_template_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`practice_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `plan_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`practice_id`) REFERENCES `practices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_template_items_unique` ON `plan_template_items` (`template_id`,`practice_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `plan_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `week_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source` text NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `week_plans_week_start_unique` ON `week_plans` (`week_start`);--> statement-breakpoint
ALTER TABLE `practices` ADD `default_days` text;