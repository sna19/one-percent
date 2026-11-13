ALTER TABLE `plan_items` ADD `note` text;--> statement-breakpoint
ALTER TABLE `plan_items` ADD `note_updated_at` text;--> statement-breakpoint
ALTER TABLE `plan_template_items` ADD `note` text;--> statement-breakpoint
ALTER TABLE `practices` ADD `show_note_full` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `practices` ADD `checklist_marks` integer DEFAULT false NOT NULL;