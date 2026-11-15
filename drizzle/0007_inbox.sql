CREATE TABLE `inbox_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` text,
	`target` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_items_client_id_unique` ON `inbox_items` (`client_id`);