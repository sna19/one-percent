import type { DateStr } from './dates.js';

export interface PracticeView {
	id: number;
	title: string;
	unit: string;
	minDose: number;
	normDose: number;
	color: string;
	goalId: number;
	goalTitle: string;
	/** for the tree in «Сделать что-то ещё» (#12): the goal's and category's place in the settings order */
	goalOrder: number;
	/** Spec 013: the goal's picture, for its small label in rows */
	goalImageKind?: 'icon' | 'emoji' | 'text';
	goalImageValue?: string;
	categoryId: number;
	categoryName: string;
	categoryOrder: number;
	/** null when the practice has no format or its format is archived. */
	formatId: number | null;
	formatName: string | null;
	formatOrder: number | null;
	/** Spec 005: standing note (Tiptap JSON) and when it last changed. */
	note: import('./note.js').NoteDoc | null;
	noteUpdatedAt: string | null;
	/** Spec 006 flags */
	showNoteFull: boolean;
	checklistMarks: boolean;
	/** task 12: first in «Сделать что-то ещё» */
	recommended: boolean;
	/** #27: its note links are on the «Ссылки» tab */
	inLinks?: boolean;
	/** Usual weekdays for planning, 0 (Sun) … 6 (Sat). */
	defaultDays: number[];
	createdOn: DateStr;
	/** Last date with amount ≥ min dose, not after today. */
	lastDone: DateStr | null;
}

export interface PlanView {
	weekStart: DateStr;
	status: 'draft' | 'confirmed';
	source: string;
	/** practiceId → planned dates */
	items: Record<number, DateStr[]>;
	/** Spec 006: day notes by `${practiceId}|${date}` */
	notes: Record<string, { note: import('./note.js').NoteDoc; updatedAt: string | null }>;
	/** Spec 010: focus of the week, up to three goal ids */
	focus?: number[];
}

export interface WeekSummary {
	planned: number;
	done: number;
	bonus: number;
}

export interface WeekData {
	start: DateStr;
	practices: PracticeView[];
	/** practiceId → date → amount */
	entries: Record<number, Record<DateStr, number>>;
	/** Spec 003: null for weeks without a plan (past weeks before planning, future weeks not planned yet). */
	plan: PlanView | null;
	/**
	 * Spec 010 «Ротация: пауза по плану»: goalId → Sundays of weeks that have a plan with none of the goal's
	 * practices in it. Such weeks do not add to «N дней без». Missing in data cached before this field.
	 */
	pausedWeeks?: Record<number, DateStr[]>;
	/** Spec 009: goalId → its open milestone. Missing in data cached before this field. */
	milestones?: Record<number, import('./milestones.js').MilestoneView>;
	/** Spec 010: Sunday of last week when its review is ready and not opened yet */
	reviewPending?: DateStr | null;
	/** #24: practiceId → its volume (a book), for practices that have one */
	volumes?: Record<number, import('./server/volume.js').VolumeView>;
}
