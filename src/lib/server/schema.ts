import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const createdAt = () =>
	text('created_at')
		.notNull()
		.default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const categories = sqliteTable('categories', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	/** Key from the fixed palette (no red), see src/lib/palette.ts. */
	color: text('color').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	archivedAt: text('archived_at'),
	createdAt: createdAt()
});

export const goals = sqliteTable('goals', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	categoryId: integer('category_id')
		.notNull()
		.references(() => categories.id),
	direction: text('direction').notNull().default(''),
	milestoneText: text('milestone_text').notNull().default(''),
	/** v0.1 uses only 'active'; other statuses come with later specs. */
	status: text('status').notNull().default('active'),
	sortOrder: integer('sort_order').notNull().default(0),
	archivedAt: text('archived_at'),
	createdAt: createdAt()
});

/** How a practice is done (Spec 002): the second lens on the main screen. */
export const formats = sqliteTable('formats', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	archivedAt: text('archived_at'),
	createdAt: createdAt()
});

export const practices = sqliteTable('practices', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	goalId: integer('goal_id')
		.notNull()
		.references(() => goals.id),
	title: text('title').notNull(),
	/** Optional; practices without one form the «Без формата» group. */
	formatId: integer('format_id').references(() => formats.id),
	unit: text('unit').notNull(),
	minDose: real('min_dose').notNull(),
	normDose: real('norm_dose').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	/** Spec 003: usual weekdays for planning, comma-separated 0 (Sun) … 6 (Sat); null = none. */
	defaultDays: text('default_days'),
	/** Spec 005: the practice's standing note, Tiptap JSON; never rendered as HTML. */
	note: text('note'),
	/** Client time of the last note change: the later change wins. */
	noteUpdatedAt: text('note_updated_at'),
	/** Spec 006: show the day note whole on the Today card (title «План дня»). */
	showNoteFull: integer('show_note_full', { mode: 'boolean' }).notNull().default(false),
	/** Spec 006: the day's depth comes from the day note's checklist. */
	checklistMarks: integer('checklist_marks', { mode: 'boolean' }).notNull().default(false),
	archivedAt: text('archived_at'),
	createdAt: createdAt()
});

export const entries = sqliteTable(
	'entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		practiceId: integer('practice_id')
			.notNull()
			.references(() => practices.id),
		/** Local calendar date, YYYY-MM-DD. */
		date: text('date').notNull(),
		amount: real('amount').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(t) => [uniqueIndex('entries_practice_date').on(t.practiceId, t.date)]
);

/** Spec 003: one plan per week. A draft works as a plan until it is confirmed. */
export const weekPlans = sqliteTable('week_plans', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Sunday of the week, YYYY-MM-DD. */
	weekStart: text('week_start').notNull().unique(),
	status: text('status', { enum: ['draft', 'confirmed'] }).notNull().default('draft'),
	/** previous | empty | default | week:<YYYY-MM-DD> | template:<id> */
	source: text('source').notNull(),
	confirmedAt: text('confirmed_at'),
	createdAt: createdAt()
});

export const planItems = sqliteTable(
	'plan_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		weekPlanId: integer('week_plan_id')
			.notNull()
			.references(() => weekPlans.id),
		practiceId: integer('practice_id')
			.notNull()
			.references(() => practices.id),
		date: text('date').notNull(),
		/** Spec 006: the day note, Tiptap JSON like the practice note. */
		note: text('note'),
		noteUpdatedAt: text('note_updated_at')
	},
	(t) => [uniqueIndex('plan_items_practice_date').on(t.practiceId, t.date)]
);

export const planTemplates = sqliteTable('plan_templates', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	sortOrder: integer('sort_order').notNull().default(0),
	archivedAt: text('archived_at'),
	createdAt: createdAt()
});

export const planTemplateItems = sqliteTable(
	'plan_template_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		templateId: integer('template_id')
			.notNull()
			.references(() => planTemplates.id),
		practiceId: integer('practice_id')
			.notNull()
			.references(() => practices.id),
		/** 0 (Sun) … 6 (Sat) */
		weekday: integer('weekday').notNull(),
		/** Spec 006: day note kept without ticked boxes. */
		note: text('note')
	},
	(t) => [uniqueIndex('plan_template_items_unique').on(t.templateId, t.practiceId, t.weekday)]
);

/** Small key/value settings, e.g. the soft limit of practices in a plan. */
export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});
