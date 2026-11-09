import { describe, expect, it } from 'vitest';
import { dayTitle, doseHint, todayLists } from './today.js';
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
	createdOn: '2026-11-01',
	lastDone: null,
	...o
});

const T = '2026-11-09';
const practices = [
	P({ id: 1, goalId: 1, lastDone: '2026-11-08' }), // planned, done today
	P({ id: 2, goalId: 2, lastDone: '2026-11-02' }), // planned, not done, long without
	P({ id: 3, goalId: 3, lastDone: '2026-11-07' }), // planned, partial (below min)
	P({ id: 4, goalId: 4 }), // not planned, done → bonus
	P({ id: 5, goalId: 5 }) // not planned, not done → other
];
const plan = new Set([1, 2, 3].map((id) => `${id}|${T}`));
const isPlanned = (id: number, d: string) => plan.has(`${id}|${d}`);
const marks: Record<string, number> = { [`1|${T}`]: 15, [`3|${T}`]: 2, [`4|${T}`]: 15 };
const amountOf = (id: number, d: string) => marks[`${id}|${d}`];

describe('todayLists', () => {
	const l = todayLists(practices, T, isPlanned, amountOf);
	it('splits into to do, done (with bonus) and other', () => {
		expect(l.todo.map((p) => p.id)).toEqual([2, 3]);
		expect(l.done.map((d) => [d.p.id, d.bonus])).toEqual([
			[1, false],
			[4, true]
		]);
		expect(l.other.map((p) => p.id)).toEqual([5]);
	});
	it('counts the plan and picks the goal waiting longest', () => {
		expect([l.plannedDone, l.planned]).toEqual([1, 3]);
		expect(l.top).toBe('goal2');
	});
	it('no top when the plan for today is done', () => {
		const all: Record<string, number> = { ...marks, [`2|${T}`]: 15, [`3|${T}`]: 15 };
		expect(todayLists(practices, T, isPlanned, (id, d) => all[`${id}|${d}`]).top).toBeUndefined();
	});
});

describe('labels', () => {
	it('day title and dose hint', () => {
		expect(dayTitle('2026-11-09')).toBe('Пн, 9 ноября');
		expect(doseHint({ minDose: 5, normDose: 15, unit: 'мин' })).toBe('мин 5 · норма 15 мин');
		expect(doseHint({ minDose: 1, normDose: 1, unit: 'трен' })).toBe('норма 1 трен');
	});
});
