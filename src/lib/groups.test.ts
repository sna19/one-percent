import { describe, expect, it } from 'vitest';
import { dayScore, groupCell, groupDaysWithout, groupPractices } from './groups.js';
import type { PracticeView } from './types.js';

const P = (o: Partial<PracticeView> & { id: number; goalId: number }): PracticeView => ({
	title: `p${o.id}`,
	unit: 'мин',
	minDose: 5,
	normDose: 15,
	color: 'blue',
	goalTitle: `goal${o.goalId}`,
	formatId: null,
	formatName: null,
	formatOrder: null,
	defaultDays: [],
	note: null,
	noteUpdatedAt: null,
	createdOn: '2026-11-01',
	lastDone: null,
	...o
});

// Italian: practice (lang) + audiobook; Sport: gym + aerobics; HBR alone
const practices = [
	P({ id: 1, goalId: 1, formatId: 1, formatName: 'Практика языка', formatOrder: 0 }),
	P({ id: 2, goalId: 1, formatId: 2, formatName: 'Аудиокниги', formatOrder: 1 }),
	P({ id: 3, goalId: 2, minDose: 1, normDose: 3 }),
	P({ id: 4, goalId: 3, color: 'green', minDose: 1, normDose: 1, formatId: 4, formatName: 'Спорт', formatOrder: 3 }),
	P({ id: 5, goalId: 3, color: 'green', minDose: 1, normDose: 1, formatId: 4, formatName: 'Спорт', formatOrder: 3 }),
	P({ id: 6, goalId: 4, formatId: 2, formatName: 'Аудиокниги', formatOrder: 1 })
];

const marks: Record<string, number> = { '1|2026-11-07': 15, '2|2026-11-07': 20, '4|2026-11-07': 1 };
const amountOf = (id: number, d: string) => marks[`${id}|${d}`];

describe('groupPractices', () => {
	it('by goal keeps practice order', () => {
		expect(groupPractices(practices, 'goal').map((g) => [g.key, g.practices.map((p) => p.id)])).toEqual([
			['g1', [1, 2]],
			['g2', [3]],
			['g3', [4, 5]],
			['g4', [6]]
		]);
	});
	it('by format follows format order, no format last', () => {
		expect(groupPractices(practices, 'format').map((g) => [g.title, g.practices.map((p) => p.id)])).toEqual([
			['Практика языка', [1]],
			['Аудиокниги', [2, 6]],
			['Спорт', [4, 5]],
			['Без формата', [3]]
		]);
	});
});

describe('group cell', () => {
	const [italian, , sport] = groupPractices(practices, 'goal');
	it('depth is the deepest practice, done counts practices at min', () => {
		expect(groupCell(italian, '2026-11-07', amountOf)).toEqual({ depth: 1.5, color: 'blue', done: 2 });
		expect(groupCell(sport, '2026-11-07', amountOf)).toEqual({ depth: 1, color: 'green', done: 1 });
		expect(groupCell(sport, '2026-11-06', amountOf)).toEqual({ depth: 0, color: 'green', done: 0 });
	});
	it('days without counts from the latest practice', () => {
		const g = { ...sport, practices: sport.practices.map((p, i) => ({ ...p, lastDone: i ? '2026-11-03' : '2026-11-05' })) };
		expect(groupDaysWithout(g, '2026-11-07')).toBe(1);
	});
});

describe('dayScore', () => {
	it('counts goals, the same in both lenses', () => {
		expect(dayScore(practices, '2026-11-07', amountOf)).toEqual({ done: 2, total: 4 });
	});
});

describe('plan lens', async () => {
	const { planPractices, planDayScore, planWeekSummary } = await import('./groups.js');
	const days = ['2026-11-06', '2026-11-07'];
	// planned: Italian practice (1) on both days, Sport gym (4) on the 7th
	const plan = new Set(['1|2026-11-06', '1|2026-11-07', '4|2026-11-07']);
	const isPlanned = (id: number, d: string) => plan.has(`${id}|${d}`);

	it('shows planned practices and bonus ones, hides the rest', () => {
		// marks on the 7th: 1 (planned), 2 (bonus), 4 (planned)
		expect(planPractices(practices, days, isPlanned, amountOf).map((p) => p.id)).toEqual([1, 2, 4]);
	});
	it('day score counts planned goals only', () => {
		expect(planDayScore(practices, '2026-11-07', isPlanned, amountOf)).toEqual({ done: 2, total: 2 });
		expect(planDayScore(practices, '2026-11-06', isPlanned, amountOf)).toEqual({ done: 0, total: 1 });
	});
	it('week summary: planned, done of planned, bonus', () => {
		expect(planWeekSummary(practices, days, isPlanned, amountOf)).toEqual({ planned: 3, done: 2, bonus: 1 });
	});
});
