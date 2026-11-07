import { diffDays, addDays, type DateStr } from './dates.js';

export interface Dose {
	minDose: number;
	normDose: number;
}

/** Depth of a cell: 0 none, 0.5 at least minimum, 1 norm, 1.5 above norm. A skip is never punished. */
export type Depth = 0 | 0.5 | 1 | 1.5;

export function depth(amount: number | undefined, p: Dose): Depth {
	if (!amount || amount <= 0) return 0;
	if (amount > p.normDose) return 1.5;
	if (amount >= p.normDose) return 1;
	if (amount >= p.minDose) return 0.5;
	return 0;
}

export function counts(amount: number | undefined, p: Dose): boolean {
	return depth(amount, p) > 0;
}

/**
 * "N дней без": days since the last entry at or above min dose.
 * Today does not count until it is over. Never done: counted from the day the practice was created.
 */
export function daysWithout(lastDone: DateStr | null, createdOn: DateStr, today: DateStr): number {
	if (lastDone && lastDone >= today) return 0;
	const ref = lastDone ?? addDays(createdOn, -1);
	return Math.max(0, diffDays(ref, today) - 1);
}

/** "Сегодня в приоритете": the practice with the largest N among those not marked today; ties keep list order. */
export function priority<T extends { id: number; n: number; doneToday: boolean }>(rows: T[]): T | undefined {
	let best: T | undefined;
	for (const r of rows) if (!r.doneToday && (!best || r.n > best.n)) best = r;
	return best;
}
