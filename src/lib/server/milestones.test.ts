import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { setEntry } from './entries.js';
import { goals, milestones, practices } from './schema.js';
import { closeMilestone, createMilestone, dueMilestones, goalMilestones, openMilestones, reopenMilestone, snoozeMilestone, updateMilestone } from './milestones.js';
import { amountLabel, budgetLabel, pace, remaining, todayAdds } from '../milestones.js';
import { plainToDoc } from '../inbox.js';

const T = '2026-11-16';
function setup() {
	const { db } = openDb(':memory:');
	seedIfEmpty(db);
	const p1 = db.select().from(practices).where(eq(practices.id, 1)).get()!; // Итальянский, мин
	return { db, goal: p1.goalId, p1 };
}

describe('milestones (Spec 009 A)', () => {
	it('one open per goal; amount progress counts the budget unit, sessions count days ≥ min', () => {
		const { db, goal, p1 } = setup();
		const id = createMilestone(db, goal, { title: 'Разговор 15 мин', criterion: plainToDoc('15 минут без пауз'), startDate: '2026-11-01', dueDate: '2026-12-27', budgetKind: 'amount', budgetUnit: 'мин', budgetTarget: 720 }, T);
		expect(() => createMilestone(db, goal, { title: 'ещё' }, T)).toThrow('уже есть');
		setEntry(db, p1.id, '2026-11-02', 20);
		setEntry(db, p1.id, '2026-11-03', 2); // below min still adds minutes
		setEntry(db, p1.id, T, 15);
		setEntry(db, p1.id, '2026-10-30', 50); // before start
		const g = goalMilestones(db, goal, T);
		expect(g.open!.progressBefore).toBe(22);
		expect(g.progress).toBe(37);
		updateMilestone(db, id, { title: 'Разговор 15 мин', budgetKind: 'sessions', budgetTarget: 20, dueDate: '2026-12-27' }, T);
		expect(goalMilestones(db, goal, T).progress).toBe(2); // Nov 2 and today; Nov 3 is below min
		expect(openMilestones(db, T)[goal].startDate).toBe('2026-11-01');
	});

	it('validation: short title, due not before start, budget needs a number', () => {
		const { db, goal } = setup();
		expect(() => createMilestone(db, goal, { title: '' }, T)).toThrow();
		expect(() => createMilestone(db, goal, { title: 'x'.repeat(41) }, T)).toThrow();
		expect(() => createMilestone(db, goal, { title: 'x', startDate: T, dueDate: '2026-11-01' }, T)).toThrow();
		expect(() => createMilestone(db, goal, { title: 'x', budgetKind: 'amount', budgetTarget: 5 }, T)).toThrow('единицу');
	});

	it('due check: shows on the day and after, «Позже» hides until tomorrow; close and reopen with a new date', () => {
		const { db, goal } = setup();
		const id = createMilestone(db, goal, { title: 'A', startDate: '2026-10-01', dueDate: T }, T);
		expect(dueMilestones(db, '2026-11-15')).toHaveLength(0);
		expect(dueMilestones(db, T)).toHaveLength(1);
		snoozeMilestone(db, id, T);
		expect(dueMilestones(db, T)).toHaveLength(0);
		expect(dueMilestones(db, '2026-11-17')).toHaveLength(1);
		closeMilestone(db, id, 'missed', 'делал редко');
		expect(goalMilestones(db, goal, T).history[0]).toMatchObject({ status: 'missed', reviewNote: 'делал редко' });
		reopenMilestone(db, id, '2026-12-01');
		expect(goalMilestones(db, goal, T).open).toMatchObject({ dueDate: '2026-12-01', reviewNote: 'делал редко' });
	});

	it('migration moved the old text into an open milestone without a date', async () => {
		const { readFileSync } = await import('node:fs');
		const { db, goal } = setup();
		db.delete(milestones).run();
		db.update(goals).set({ milestoneText: 'Читать новости без словаря' }).where(eq(goals.id, goal)).run();
		const sql = readFileSync('drizzle/0008_milestones.sql', 'utf8').split('--> statement-breakpoint')[1];
		(db as unknown as { $client: { exec: (s: string) => void } }).$client.exec(sql);
		const m = db.select().from(milestones).get()!;
		expect([m.goalId, m.title, m.dueDate, m.status]).toEqual([goal, 'Читать новости без словаря', null, 'open']);
		expect(JSON.parse(m.criterion!).content[0].content[0].text).toBe('Читать новости без словаря');
	});
});

describe('milestone labels and pace', () => {
	it('remaining time', () => {
		expect(remaining('2026-12-28', T)).toBe('6 нед');
		expect(remaining('2026-11-25', T)).toBe('9 дн');
		expect(remaining(T, T)).toBe('сегодня');
		expect(remaining('2026-11-10', T)).toBe('проверить');
		expect(remaining(null, T)).toBe('');
	});
	it('minutes in hours from 60, budget line, pace and today', () => {
		expect(amountLabel(15, 'мин')).toBe('15 мин');
		expect(amountLabel(90, 'мин')).toBe('1,5 ч');
		expect(budgetLabel({ budgetKind: 'amount', budgetUnit: 'мин', budgetTarget: 720 }, 300)).toBe('5 из 12 ч');
		expect(budgetLabel({ budgetKind: 'sessions', budgetUnit: null, budgetTarget: 20 }, 7)).toBe('7 из 20 занятий');
		const p = pace({ budgetKind: 'amount', budgetTarget: 100, startDate: '2026-11-01', dueDate: '2026-11-20' }, 30, '2026-11-10')!;
		expect(p.expected).toBe(50);
		expect(p.delta).toBe(-20);
		const ps = [{ id: 1, goalId: 1, unit: 'мин', minDose: 5, normDose: 15 }];
		expect(todayAdds({ budgetKind: 'amount', budgetUnit: 'мин', goalId: 1, startDate: '2026-11-01' }, ps, () => 15, T)).toBe(15);
		expect(todayAdds({ budgetKind: 'sessions', budgetUnit: null, goalId: 1, startDate: '2026-11-01' }, ps, () => 3, T)).toBe(0);
	});
});
