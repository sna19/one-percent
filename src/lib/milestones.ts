import { diffDays, type DateStr } from './dates.js';
import { counts } from './rules.js';
import type { NoteDoc } from './note.js';

/** Spec 009 — milestones on the device: the card line, the flash, the goal screen. */

export interface MilestoneView {
	id: number;
	goalId: number;
	title: string;
	criterion: NoteDoc | null;
	dueDate: DateStr | null;
	startDate: DateStr;
	budgetKind: 'none' | 'sessions' | 'amount';
	budgetUnit: string | null;
	budgetTarget: number | null;
	status: 'open' | 'achieved' | 'missed' | 'dropped';
	closedAt: string | null;
	reviewNote: string | null;
	snoozedUntil: DateStr | null;
	/** progress up to yesterday (open) or up to the closing day; today is added on the device */
	progressBefore: number;
}

/** «6 нед», under two weeks «9 дн», on the day «сегодня», after it «проверить» (neutral). No date — ''. */
export function remaining(due: DateStr | null, today: DateStr): string {
	if (!due) return '';
	const d = diffDays(today, due);
	if (d < 0) return 'проверить';
	if (d === 0) return 'сегодня';
	if (d < 14) return `${d} дн`;
	return `${Math.round(d / 7)} нед`;
}

/** Minutes from 60 on are shown in hours (Spec 009); other units as they are. */
export function amountLabel(v: number, unit: string | null): string {
	const r = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
	if (unit === 'мин' && v >= 60) return `${r(v / 60)} ч`;
	return `${r(v)} ${unit ?? ''}`.trim();
}

/** «5 из 12 ч» / «7 из 20 занятий». */
export function budgetLabel(m: Pick<MilestoneView, 'budgetKind' | 'budgetUnit' | 'budgetTarget'>, done: number): string {
	if (m.budgetKind === 'none' || !m.budgetTarget) return '';
	if (m.budgetKind === 'sessions') return `${done} из ${m.budgetTarget} занятий`;
	if (m.budgetUnit === 'мин' && m.budgetTarget >= 60) {
		const r = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
		return `${r(done / 60)} из ${r(m.budgetTarget / 60)} ч`;
	}
	return `${amountLabel(done, m.budgetUnit).replace(/ \S+$/, '')} из ${amountLabel(m.budgetTarget, m.budgetUnit)}`;
}

export interface Pace {
	/** expected by today at an even pace */
	expected: number;
	/** done − expected: above zero — ahead */
	delta: number;
	/** share of the time gone, 0…1 */
	timeShare: number;
}

/** Pace: expected = target × days gone / all days (Spec 009). Null without a budget or a date. */
export function pace(m: Pick<MilestoneView, 'budgetKind' | 'budgetTarget' | 'startDate' | 'dueDate'>, done: number, today: DateStr): Pace | null {
	if (!m.dueDate) return null;
	const all = Math.max(1, diffDays(m.startDate, m.dueDate) + 1);
	const gone = Math.min(all, Math.max(0, diffDays(m.startDate, today) + 1));
	const timeShare = gone / all;
	if (m.budgetKind === 'none' || !m.budgetTarget) return { expected: 0, delta: 0, timeShare };
	const expected = m.budgetTarget * timeShare;
	return { expected, delta: done - expected, timeShare };
}

/** What today's marks add to a milestone of their goal (the server counts up to yesterday). */
export function todayAdds(
	m: Pick<MilestoneView, 'budgetKind' | 'budgetUnit' | 'goalId' | 'startDate'>,
	practices: { id: number; goalId: number; unit: string; minDose: number; normDose: number }[],
	amountOf: (practiceId: number) => number | undefined,
	today: DateStr
): number {
	if (m.budgetKind === 'none' || today < m.startDate) return 0;
	const mine = practices.filter((p) => p.goalId === m.goalId);
	if (m.budgetKind === 'sessions') return mine.some((p) => counts(amountOf(p.id), p)) ? 1 : 0;
	return mine.filter((p) => p.unit === m.budgetUnit).reduce((s, p) => s + (amountOf(p.id) ?? 0), 0);
}
