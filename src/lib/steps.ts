import type { DateStr } from './dates.js';
import type { NoteDoc } from './note.js';

/** #28 — a step on the device. */
export interface StepView {
	id: number;
	goalId: number;
	goalTitle: string;
	practiceId: number | null;
	title: string;
	plannedDate: DateStr | null;
	note: NoteDoc | null;
	sortOrder: number;
	createdAt: string;
	doneAt: string | null;
}

/** A step older than this is softly highlighted and shows up in the weekly review. */
/* #29: the age mark of a step is the registry's «stale_days»; the rows on «Сегодня» — «today.steps_rows» */
/** At most this many goal steps in the block on top of «Сегодня». */

