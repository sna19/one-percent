ALTER TABLE `goals` ADD `kind` text DEFAULT 'growth' NOT NULL;--> statement-breakpoint
ALTER TABLE `steps` ADD `due_date` text;