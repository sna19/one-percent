import type { DateStr } from './dates.js';
import type { NoteDoc } from './note.js';

/**
 * #28 — a step on the device; #30: in the interface it is a «дело» (a deed) — of a goal of growth or of a sphere of
 * life (area). A deed always has its goal or sphere («нет бесхозных задач»).
 */
export interface StepView {
	id: number;
	goalId: number;
	goalTitle: string;
	/** growth | area */
	goalKind: string;
	goalImageKind?: string;
	goalImageValue?: string;
	practiceId: number | null;
	title: string;
	plannedDate: DateStr | null;
	/** #30: a deadline, optional */
	dueDate: DateStr | null;
	note: NoteDoc | null;
	sortOrder: number;
	createdAt: string;
	doneAt: string | null;
}

/** A step older than this is softly highlighted and shows up in the weekly review. */
/* #29: the age mark of a step is the registry's «stale_days»; the rows on «Сегодня» — «today.steps_rows» */
/** At most this many goal steps in the block on top of «Сегодня». */


/**
 * #30: a deed is on «Сегодня» (the two-zone view) when its day has come, or its deadline is within two days.
 * Others wait in their sphere or goal. A deed whose day has passed undone stays on today — without red.
 */
export function deedToday(s: Pick<StepView, 'plannedDate' | 'dueDate' | 'practiceId' | 'doneAt'>, day: DateStr): boolean {
	if (s.practiceId !== null || s.doneAt) return false;
	if (s.plannedDate && s.plannedDate <= day) return true;
	if (s.dueDate) {
		const d = new Date(day + 'T12:00:00Z');
		d.setUTCDate(d.getUTCDate() + 2);
		return s.dueDate <= d.toISOString().slice(0, 10);
	}
	return false;
}
