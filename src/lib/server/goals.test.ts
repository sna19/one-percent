import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { setEntry } from './entries.js';
import { applySource, setPlanItem } from './plan.js';
import { goals, practices } from './schema.js';
import { gallery } from './goals.js';
import { createMilestone, closeMilestone } from './milestones.js';

const T = '2026-11-18'; // Wednesday; week from Sunday 15th

describe('goals gallery (Spec 013)', () => {
	it('week dots, pause by plan, invested hours or days, achieved milestones, the path', () => {
		const { db } = openDb(':memory:');
		seedIfEmpty(db);
		const g1 = db.select().from(practices).where(eq(practices.id, 1)).get()!.goalId; // minutes
		const g3 = db.select().from(practices).where(eq(practices.id, 3)).get()!.goalId; // pages
		setEntry(db, 1, '2026-11-16', 20);
		setEntry(db, 1, '2026-11-17', 2); // below min: no dot, but minutes count
		setEntry(db, 1, '2026-10-01', 40);
		setEntry(db, 3, '2026-11-15', 5);
		setEntry(db, 3, '2026-11-01', 5);
		applySource(db, '2026-11-15', '2026-11-15', 'empty');
		setPlanItem(db, '2026-11-15', '2026-11-15', 1, '2026-11-19', true);
		const id = createMilestone(db, g1, { title: 'A', startDate: '2026-09-01' }, T);
		closeMilestone(db, id, 'achieved', null);
		const g = gallery(db, T);
		const all = g.categories.flatMap((c) => c.goals);
		const a = all.find((x) => x.id === g1)!;
		expect(a.week).toEqual([false, true, false, false, false, false, false]);
		expect(a.invested).toEqual({ kind: 'hours', value: 1.0333333333333334 });
		expect(a.paused).toBe(false);
		expect(a.achieved).toBe(1);
		const b = all.find((x) => x.id === g3)!;
		expect(b.invested).toEqual({ kind: 'days', value: 2 });
		expect(b.paused).toBe(true);
		db.update(goals).set({ archivedAt: '2026-11-18T10:00:00Z' }).where(eq(goals.id, g3)).run();
		const after = gallery(db, T);
		expect(after.path.map((x) => x.id)).toEqual([g3]);
		expect(after.categories.flatMap((c) => c.goals).map((x) => x.id)).not.toContain(g3);
	});
});
