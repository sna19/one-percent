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
	/** Spec 013: the goal's picture — icon (a name from the app's set) | emoji | text (1–3 characters) */
	imageKind: text('image_kind', { enum: ['icon', 'emoji', 'text'] }).notNull().default('text'),
	imageValue: text('image_value').notNull().default(''),
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
	/** Task 12: shown first in «Сделать что-то ещё»; does not plan it and does not count for the day. */
	recommended: integer('recommended', { mode: 'boolean' }).notNull().default(false),
	/** #27: the practice's note links are on the «Ссылки» tab; its place among the groups there */
	inLinks: integer('in_links', { mode: 'boolean' }).notNull().default(false),
	linksOrder: integer('links_order').notNull().default(0),
	/**
	 * #24 — a finite practice (a book): its whole volume in the practice's unit; null — endless as before.
	 * Position = volume_start + the amounts marked from volume_since on. «Я на стр. N» moves volume_start so the
	 * position is N now; the marks themselves never change.
	 */
	volumeTotal: real('volume_total'),
	volumeStart: real('volume_start').notNull().default(0),
	volumeSince: text('volume_since'),
	/** the day the volume was gone through; the card then offers «Следующая книга» or «Закончить практику» */
	volumeDoneOn: text('volume_done_on'),
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
	/** Spec 010: up to three goals the week is planned for, comma-separated ids; only goals in this plan */
	focusGoalIds: text('focus_goal_ids'),
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

/**
 * Spec 008 — «Входящие»: a thought written in one touch, sorted later. Only sorted, never done from here.
 * The text is a note document (Tiptap JSON, like notes). `clientId` makes the offline queue replay safe.
 */
export const inboxItems = sqliteTable('inbox_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	clientId: text('client_id').notNull().unique(),
	text: text('text').notNull(),
	createdAt: text('created_at').notNull(),
	updatedAt: text('updated_at').notNull(),
	/** open | done | processed | deleted */
	status: text('status', { enum: ['open', 'done', 'processed', 'deleted'] }).notNull().default('open'),
	closedAt: text('closed_at'),
	/** where it was sorted to, for «История»: «Заметка «Всегда»: Итальянский», «Новая цель: …» */
	target: text('target')
});

/**
 * Spec 009 — a milestone: a checkable point of a goal with a date. A goal has at most one open milestone;
 * closed ones are its history. Progress and pace are counted from entries, never stored.
 */
export const milestones = sqliteTable('milestones', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	goalId: integer('goal_id')
		.notNull()
		.references(() => goals.id),
	/** short name for the card line and the flash, up to ~30 characters */
	title: text('title').notNull(),
	/** how to show it is reached — yes or no; note document (Tiptap JSON) or null */
	criterion: text('criterion'),
	/** YYYY-MM-DD; null — no date yet (migrated from the old text field) */
	dueDate: text('due_date'),
	startDate: text('start_date').notNull(),
	/** none | sessions (days with any practice of the goal ≥ min) | amount (sum of amounts in budget_unit) */
	budgetKind: text('budget_kind', { enum: ['none', 'sessions', 'amount'] }).notNull().default('none'),
	budgetUnit: text('budget_unit'),
	budgetTarget: real('budget_target'),
	status: text('status', { enum: ['open', 'achieved', 'missed', 'dropped'] }).notNull().default('open'),
	closedAt: text('closed_at'),
	reviewNote: text('review_note'),
	/** «Позже» on the due-date card: hidden until this date */
	snoozedUntil: text('snoozed_until'),
	createdAt: createdAt()
});

/** Spec 010 — the weekly review is counted from the data; only the retro answer is stored. */
export const weekReviews = sqliteTable('week_reviews', {
	/** Sunday of the reviewed week */
	weekStart: text('week_start').primaryKey(),
	/** «Что изменишь на следующей неделе?» */
	retroText: text('retro_text'),
	/** answered a week later: did it work? yes | partly | no */
	retroResult: text('retro_result', { enum: ['yes', 'partly', 'no'] }),
	viewedAt: text('viewed_at')
});

/** #24 — a volume gone through (a book read): kept for the goal's «Пройденный путь». */
export const volumesDone = sqliteTable('volumes_done', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	practiceId: integer('practice_id')
		.notNull()
		.references(() => practices.id),
	goalId: integer('goal_id').notNull(),
	/** what it was — the practice's title at the time */
	label: text('label').notNull(),
	total: real('total').notNull(),
	unit: text('unit').notNull(),
	startedOn: text('started_on').notNull(),
	finishedOn: text('finished_on').notNull()
});

/**
 * #28 — a step: a one-off task of a goal (optionally a part of one of its practices — a precondition,
 * «сначала …»). No dose, no repeat: one box. Done steps go to the goal's «Пройденный путь».
 */
export const steps = sqliteTable('steps', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	goalId: integer('goal_id')
		.notNull()
		.references(() => goals.id),
	practiceId: integer('practice_id').references(() => practices.id),
	title: text('title').notNull(),
	/** a day for it, optional; it shows on «Сегодня» from that day */
	plannedDate: text('planned_date'),
	/** note document (Tiptap JSON), optional */
	note: text('note'),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: createdAt(),
	doneAt: text('done_at')
});
