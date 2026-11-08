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
