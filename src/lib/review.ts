import type { DateStr } from './dates.js';

/**
 * Spec 010 — «Итоги недели». Every threshold lives here, to be tuned after some weeks of use.
 */
export const REVIEW = {
	/** weeks before the reviewed one used for «your usual» */
	HISTORY_WEEKS: 4,
	/** fading: done this week below this share of the usual */
	FADING_SHARE: 0.5,
	/** a weekday is weak when less than this share of its plan was done */
	WEAK_DAY: 0.5,
	/** a practice done less than half of its plan this many weeks running is «too much» */
	WEAK_PRACTICE_WEEKS: 3,
	/** a milestone is worth a look when its date is within this many days after the week */
	MILESTONE_SOON_DAYS: 14,
	/** one format taking this share of the minutes is a skew worth a sentence */
	TIME_SKEW: 0.6,
	/** overload: more fading goals than this suggests pausing some */
	OVERLOAD_FADING: 3
} as const;

export interface GoalWeek {
	goalId: number;
	title: string;
	categoryId: number;
	color: string;
	planned: number;
	plannedDone: number;
	bonus: number;
	/** practice-days at or above min, planned or not */
	done: number;
	/** mean of `done` over earlier weeks when the goal was in the plan; null — no history */
	usual: number | null;
}

export interface FadingRow extends GoalWeek {
	why: 'plan0' | 'drop';
	strength: number;
}

export interface MilestoneRow {
	goalId: number;
	goalTitle: string;
	title: string;
	dueDate: DateStr | null;
	/** «отстаёшь на 2 ч», «срок через 9 дн» */
	text: string;
}

export interface WeeklyReview {
	start: DateStr;
	end: DateStr;
	/** Sundays of earlier weeks with a plan, newest first, for the week picker */
	weeks: DateStr[];
	previous: { start: DateStr; retroText: string; retroResult: 'yes' | 'partly' | 'no' | null } | null;
	focus: (GoalWeek & { milestone: string | null })[];
	/** all of them; the screen shows MAX_ROWS and «ещё N» */
	fading: FadingRow[];
	plan: {
		planned: number;
		done: number;
		bonus: number;
		categories: { id: number; name: string; color: string; planned: number; done: number; goals: GoalWeek[] }[];
	};
	milestones: MilestoneRow[];
	days: { date: DateStr; planned: number; done: number }[];
	weakDays: DateStr[];
	weakPractices: string[];
	time: { name: string; minutes: number }[];
	normal: GoalWeek[];
	/** goals with no practice in this week's plan; `supported` — something was done anyway */
	paused: { goalId: number; title: string; supported: boolean }[];
	overload: { activeGoals: number } | null;
	retroText: string;
	/** #28: the oldest open step hanging two weeks or more — one line: do it, split it or drop it */
	staleStep: { goalId: number; goalTitle: string; title: string; weeks: number } | null;
	/** no plan this week at all — the screen says so instead of the blocks */
	noPlan: boolean;
}

/** «1 из 4» → usual shown as a whole number or with one decimal. */
export const num = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10).replace('.', ','));
