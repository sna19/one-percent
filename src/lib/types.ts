import type { DateStr } from './dates.js';

export interface PracticeView {
	id: number;
	title: string;
	unit: string;
	minDose: number;
	normDose: number;
	color: string;
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
