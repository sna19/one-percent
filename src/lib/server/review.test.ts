import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { setEntry } from './entries.js';
import { applySource, setPlanItem } from './plan.js';
import { practices } from './schema.js';
import { computeReview, markViewed, reviewPending, saveRetro, setFocus } from './review.js';
import { addDays, weekDays } from '../dates.js';
import { createMilestone } from './milestones.js';

// The reviewed week W = 2026-11-08 … 14; four weeks before it start on 2026-10-11.
const W = '2026-11-08';
const T = '2026-11-15';

function setup() {
	const { db } = openDb(':memory:');
	seedIfEmpty(db); // 1 Итальянский, 2 Английский вслух, 3 HBR, 4 Спорт — goals of their own
	db.update(practices).set({ createdAt: '2026-09-01T00:00:00Z' }).run();
	const goal = (pid: number) => db.select().from(practices).where(eq(practices.id, pid)).get()!.goalId;
	const plan = (w: string, pids: number[], days = [1, 3, 5]) => {
		applySource(db, w, w, 'empty');
		for (const p of pids) for (const i of days) setPlanItem(db, w, w, p, addDays(w, i), true);
	};
	const doAll = (w: string, pid: number, days = [1, 3, 5]) => days.forEach((i) => setEntry(db, pid, addDays(w, i), 15));
	return { db, goal, plan, doAll };
}

describe('weekly review (Spec 010)', () => {
	it('fading: under half of the usual, or nothing of the plan done; sorted by the drop', () => {
		const { db, goal, plan, doAll } = setup();
		for (let k = 1; k <= 4; k++) {
			const w = addDays(W, -7 * k);
			plan(w, [1, 2, 3]);
			[1, 2, 3].forEach((p) => doAll(w, p));
		}
		plan(W, [1, 2, 3]);
		doAll(W, 1); // as usual
		doAll(W, 2, [1]); // 1 of usual 3 → drop 0.67
		// 3: planned, nothing done → plan0, strongest
		const r = computeReview(db, W, T);
		expect(r.fading.map((f) => [f.goalId, f.why])).toEqual([
			[goal(3), 'plan0'],
			[goal(2), 'drop']
		]);
		expect(r.normal.map((n) => n.goalId)).toContain(goal(1));
		expect(r.plan).toMatchObject({ planned: 9, done: 4, bonus: 0 });
		expect(r.days.find((d) => d.date === addDays(W, 3))).toMatchObject({ planned: 3, done: 1 });
		expect(r.weakDays).toEqual([addDays(W, 3), addDays(W, 5)]);
	});

	it('rotation: a goal out of this week\'s plan is paused, not fading; the usual counts only planned weeks', () => {
		const { db, goal, plan, doAll } = setup();
		// set A (practice 1) in weeks W-2 and W-4 only; week B in between
		for (let k = 1; k <= 4; k++) {
			const w = addDays(W, -7 * k);
			plan(w, k % 2 === 0 ? [1, 4] : [2, 4]);
			doAll(w, 4);
			if (k % 2 === 0) doAll(w, 1);
			else doAll(w, 2);
		}
		plan(W, [1, 4]); // a week A
		doAll(W, 1);
		doAll(W, 4);
		setEntry(db, 2, addDays(W, 2), 15); // set B practice done anyway
		const r = computeReview(db, W, T);
		expect(r.fading).toHaveLength(0); // goal 1 compared with A weeks only: 3 vs 3
		expect(r.paused).toEqual(expect.arrayContaining([{ goalId: goal(2), title: expect.any(String), supported: true }]));
		expect(r.normal.map((n) => n.goalId)).not.toContain(goal(2));
	});

	it('focus first, milestones by date or lag, retro saved and shown a week later', () => {
		const { db, goal, plan, doAll } = setup();
		plan(W, [1, 2, 3]);
		doAll(W, 1);
		setFocus(db, W, [goal(1)]);
		setFocus(db, W, [goal(1), goal(4)]); // #26: any active goal
		setFocus(db, W, [goal(1)]);
		expect(() => setFocus(db, W, [1, 2, 3, 4].map(goal))).toThrow();
		createMilestone(db, goal(2), { title: 'Скоро', startDate: '2026-10-01', dueDate: '2026-11-20' }, T);
		createMilestone(db, goal(3), { title: 'Далеко', startDate: '2026-10-01', dueDate: '2027-03-01' }, T);
		const r = computeReview(db, W, T);
		expect(r.focus.map((f) => f.goalId)).toEqual([goal(1)]);
		expect(r.milestones.map((m) => m.title)).toEqual(['Скоро']);
		saveRetro(db, W, { retroText: 'Спорт утром, не вечером' });
		plan(addDays(W, 7), [1]);
		const next = computeReview(db, addDays(W, 7), '2026-11-22');
		expect(next.previous).toMatchObject({ retroText: 'Спорт утром, не вечером', retroResult: null });
		saveRetro(db, W, { retroResult: 'partly' });
		expect(computeReview(db, addDays(W, 7), '2026-11-22').previous?.retroResult).toBe('partly');
	});

	it('time by format counts only minutes; «готовы» until opened', () => {
		const { db, plan, doAll } = setup();
		plan(W, [1, 3]);
		doAll(W, 1);
		doAll(W, 3); // HBR counted in pages: not in the time block
		const r = computeReview(db, W, T);
		expect(r.time.reduce((s, t) => s + t.minutes, 0)).toBe(45);
		expect(reviewPending(db, T)).toBe(W);
		markViewed(db, W);
		expect(reviewPending(db, T)).toBeNull();
		expect(weekDays(W)).toHaveLength(7);
	});

	it('#26: focus carries over to a new week; a week without a plan gets its draft', async () => {
		const { ensureCurrentPlan, getPlan } = await import('./plan.js');
		const { db, goal, plan } = setup();
		plan(W, [1, 2]);
		setFocus(db, W, [goal(2)]);
		ensureCurrentPlan(db, addDays(W, 7), addDays(W, 7));
		expect(getPlan(db, addDays(W, 7))!.focus).toEqual([goal(2)]);
		setFocus(db, addDays(W, 14), [goal(1)], addDays(W, 8));
		expect(getPlan(db, addDays(W, 14))!.focus).toEqual([goal(1)]);
	});
});
