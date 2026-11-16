CREATE TABLE `volumes_done` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`practice_id` integer NOT NULL,
	`goal_id` integer NOT NULL,
	`label` text NOT NULL,
	`total` real NOT NULL,
	`unit` text NOT NULL,
	`started_on` text NOT NULL,
	`finished_on` text NOT NULL,
	FOREIGN KEY (`practice_id`) REFERENCES `practices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `practices` ADD `volume_total` real;--> statement-breakpoint
ALTER TABLE `practices` ADD `volume_start` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `practices` ADD `volume_since` text;--> statement-breakpoint
ALTER TABLE `practices` ADD `volume_done_on` text;