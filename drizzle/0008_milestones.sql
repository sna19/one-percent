CREATE TABLE `milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`title` text NOT NULL,
	`criterion` text,
	`due_date` text,
	`start_date` text NOT NULL,
	`budget_kind` text DEFAULT 'none' NOT NULL,
	`budget_unit` text,
	`budget_target` real,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` text,
	`review_note` text,
	`snoozed_until` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `milestones` (`goal_id`, `title`, `criterion`, `start_date`)
SELECT `id`,
	substr(trim(`milestone_text`), 1, 30),
	json_object('type', 'doc', 'content', json_array(json_object('type', 'paragraph', 'content', json_array(json_object('type', 'text', 'text', trim(`milestone_text`)))))),
	date('now', 'localtime')
FROM `goals` WHERE trim(`milestone_text`) != '';
