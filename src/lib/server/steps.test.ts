import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { practices } from './schema.js';
import { createStep, deleteStep, goalSteps, openSteps, orderSteps, setStepDone, updateStep } from './steps.js';

describe('#28 steps', () => {
	it('belong to a goal (and maybe its practice); done goes to the path and can come back; order; remove', () => {
		const { db } = openDb(':memory:');
		seedIfEmpty(db);
		const p4 = db.select().from(practices).where(eq(practices.id, 4)).get()!;
		const a = createStep(db, { goalId: p4.goalId, practiceId: 4, title: 'Вытереть пыль с пианино' });
		const b = createStep(db, { goalId: p4.goalId, title: 'Разобрать всё с крышки' });
		expect(() => createStep(db, { goalId: p4.goalId, practiceId: 1, title: 'x' })).toThrow('не из этой цели');
		expect(() => createStep(db, { goalId: p4.goalId, title: '  ' })).toThrow();
		orderSteps(db, [b, a]);
		expect(goalSteps(db, p4.goalId).open.map((s) => s.id)).toEqual([b, a]);
		updateStep(db, a, { plannedDate: '2026-11-20' });
		setStepDone(db, a, true);
		// #30: a deed done in the last day and a half stays in the list (struck through in «Сделано» until the day ends)
		expect(openSteps(db).filter((s) => !s.doneAt).map((s) => s.id)).toEqual([b]);
		expect(openSteps(db).find((s) => s.id === a)!.doneAt).not.toBeNull();
		expect(openSteps(db, new Date(Date.now() + 48 * 3600 * 1000)).map((s) => s.id)).toEqual([b]);
		expect(goalSteps(db, p4.goalId).done.map((s) => s.id)).toEqual([a]);
		setStepDone(db, a, false);
		expect(goalSteps(db, p4.goalId).open.map((s) => s.id)).toEqual([b, a]);
		deleteStep(db, b);
		expect(openSteps(db).map((s) => [s.id, s.plannedDate])).toEqual([[a, '2026-11-20']]);
	});

	it('#30: a deed has a deadline and a day; moves to another goal or sphere; a practice turns into a deed', async () => {
		const { practiceToDeed } = await import('./steps.js');
		const { deedToday } = await import('../steps.js');
		const { db } = openDb(':memory:');
		seedIfEmpty(db);
		const p4 = db.select().from(practices).where(eq(practices.id, 4)).get()!;
		const id = createStep(db, { goalId: p4.goalId, title: 'Шины', plannedDate: '2026-11-25', dueDate: '2026-11-27' });
		const st = openSteps(db).find((s) => s.id === id)!;
		expect(st).toMatchObject({ plannedDate: '2026-11-25', dueDate: '2026-11-27', goalKind: 'growth' });
		// on «Сегодня»: its day has come, or the deadline is two days away
		expect(deedToday(st, '2026-11-24')).toBe(false);
		expect(deedToday({ ...st, plannedDate: null }, '2026-11-25')).toBe(true);
		expect(deedToday({ ...st, plannedDate: null }, '2026-11-24')).toBe(false);
		expect(deedToday(st, '2026-11-26')).toBe(true);
		expect(() => updateStep(db, id, { dueDate: 'завтра' })).toThrow();
		updateStep(db, id, { goalId: 1 });
		expect(openSteps(db).find((s) => s.id === id)!.goalId).toBe(1);
		const d = practiceToDeed(db, 3, 1, '2026-11-30');
		const deed = openSteps(db).find((s) => s.id === d)!;
		expect(deed).toMatchObject({ goalId: 1, plannedDate: '2026-11-30' });
		expect(db.select().from(practices).where(eq(practices.id, 3)).get()!.archivedAt).not.toBeNull();
	});
});
