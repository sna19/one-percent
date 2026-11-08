CREATE TABLE `formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `practices` ADD `format_id` integer REFERENCES formats(id);--> statement-breakpoint
INSERT INTO `formats` (`name`, `sort_order`) VALUES ('Практика языка', 0), ('Аудиокниги', 1), ('Чтение', 2), ('Спорт', 3);
