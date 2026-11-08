import type { DateStr } from './dates.js';
import { counts, daysWithout, depth, type Depth } from './rules.js';
import type { PracticeView } from './types.js';

/** Spec 002: rows are groups of practices — by goal (default) or by format. Marks are shared. */
export type Lens = 'goal' | 'format';

export interface Group {
	key: string;
	title: string;
	practices: PracticeView[];
}

export type AmountOf = (practiceId: number, date: DateStr) => number | undefined;

export function groupPractices(practices: PracticeView[], lens: Lens): Group[] {
	const map = new Map<string, Group & { order: number }>();
	practices.forEach((p, i) => {
		const key = lens === 'goal' ? `g${p.goalId}` : `f${p.formatId ?? 0}`;
		const title = lens === 'goal' ? p.goalTitle : (p.formatName ?? 'Без формата');
		// goals follow their first practice; formats follow their own order, «Без формата» last
		const order = lens === 'goal' ? i : (p.formatOrder ?? Number.MAX_SAFE_INTEGER);
		const g = map.get(key);
		if (g) g.practices.push(p);
		else map.set(key, { key, title, practices: [p], order });
	});
	return [...map.values()].sort((a, b) => a.order - b.order).map(({ order: _, ...g }) => g);
}

export interface GroupCell {
	depth: Depth;
	/** Category colour of the practice that gives the depth. */
	color: string;
	/** Practices at or above min dose that day. */
	done: number;
}

/** A collapsed group's cell: the deepest practice of the day, plus how many were done. */
export function groupCell(g: Group, date: DateStr, amountOf: AmountOf): GroupCell {
	let best: GroupCell = { depth: 0, color: g.practices[0].color, done: 0 };
	let done = 0;
	for (const p of g.practices) {
		const a = amountOf(p.id, date);
		if (counts(a, p)) done++;
		const d = depth(a, p);
		if (d > best.depth) best = { depth: d, color: p.color, done: 0 };
	}
	return { ...best, done };
}

/** "N дней без" for a group: since the last mark of any of its practices. */
export function groupDaysWithout(g: Group, today: DateStr): number {
	const last = g.practices.reduce<DateStr | null>((m, p) => (p.lastDone && (!m || p.lastDone > m) ? p.lastDone : m), null);
	const created = g.practices.reduce((m, p) => (p.createdOn < m ? p.createdOn : m), g.practices[0].createdOn);
	return daysWithout(last, created, today);
}

/** Day score is always by goals: goals with any practice at min dose, out of active goals. */
export function dayScore(practices: PracticeView[], date: DateStr, amountOf: AmountOf) {
	const all = new Set(practices.map((p) => p.goalId));
	const done = new Set(practices.filter((p) => counts(amountOf(p.id, date), p)).map((p) => p.goalId));
	return { done: done.size, total: all.size };
}
