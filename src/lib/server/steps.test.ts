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
		expect(openSteps(db).map((s) => s.id)).toEqual([b]);
		expect(goalSteps(db, p4.goalId).done.map((s) => s.id)).toEqual([a]);
		setStepDone(db, a, false);
		expect(goalSteps(db, p4.goalId).open.map((s) => s.id)).toEqual([b, a]);
		deleteStep(db, b);
		expect(openSteps(db).map((s) => [s.id, s.plannedDate])).toEqual([[a, '2026-11-20']]);
	});
});
