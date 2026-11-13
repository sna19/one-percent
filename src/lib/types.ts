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
}
