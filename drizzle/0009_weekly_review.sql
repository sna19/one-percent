CREATE TABLE `week_reviews` (
	`week_start` text PRIMARY KEY NOT NULL,
	`retro_text` text,
	`retro_result` text,
	`viewed_at` text
);
--> statement-breakpoint
ALTER TABLE `week_plans` ADD `focus_goal_ids` text;