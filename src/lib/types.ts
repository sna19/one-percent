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
	createdOn: DateStr;
	/** Last date with amount ≥ min dose, not after today. */
	lastDone: DateStr | null;
}

export interface WeekData {
	start: DateStr;
	practices: PracticeView[];
	/** practiceId → date → amount */
	entries: Record<number, Record<DateStr, number>>;
}
