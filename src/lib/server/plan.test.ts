import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { setEntry } from './entries.js';
import { practices } from './schema.js';
import {
	applySource,
	confirmPlan,
	ensureCurrentPlan,
	getPlan,
	listTemplates,
	pastWeeks,
	setPlanItem,
	setPlanRow,
	weekSummary
} from './plan.js';
import { InputError } from './settings.js';

// Weeks: 2026-11-01 (Sun) … 2026-11-07; next week starts 2026-11-08.
const W1 = '2026-11-01';
const W2 = '2026-11-08';

function setup() {
	const { db } = openDb(':memory:');
	seedIfEmpty(db); // practices 1..4: Итальянский, Английский вслух, HBR, Спорт
	// piano: usual days Mon, Fri, Sat
	db.update(practices).set({ defaultDays: '1,5,6' }).where(eq(practices.id, 4)).run();
	return db;
}

describe('plan sources', () => {
	it('first current week without a previous plan is a draft from usual days', () => {
		const db = setup();
		const plan = ensureCurrentPlan(db, W1, W1)!;
		expect(plan.status).toBe('draft');
		expect(plan.source).toBe('default');
		expect(plan.items).toEqual({ 4: ['2026-11-02', '2026-11-06', '2026-11-07'] });
	});

	it('next week drafts from the previous week, mapped by weekday, skipping archived practices', () => {
		const db = setup();
		ensureCurrentPlan(db, W1, W1);
		setPlanItem(db, W1, W1, 1, '2026-11-03', true);
		setPlanItem(db, W1, W1, 3, '2026-11-04', true);
		db.update(practices).set({ archivedAt: 'x' }).where(eq(practices.id, 3)).run();
		const plan = ensureCurrentPlan(db, W2, W2)!;
		expect(plan.source).toBe('previous');
		expect(plan.items).toEqual({ 1: ['2026-11-10'], 4: ['2026-11-09', '2026-11-13', '2026-11-14'] });
	});

	it('a source only changes today and later', () => {
		const db = setup();
		ensureCurrentPlan(db, W1, W1); // piano Mon, Fri, Sat
		applySource(db, W1, '2026-11-04', 'empty'); // on Wednesday
		expect(getPlan(db, W1)!.items).toEqual({ 4: ['2026-11-02'] });
	});

	it('another week and a template', () => {
		const db = setup();
		ensureCurrentPlan(db, W1, W1);
		setPlanRow(db, W1, W1, 1, 'daily');
		confirmPlan(db, W1, 'Обычная неделя');
		expect(getPlan(db, W1)!.status).toBe('confirmed');
		const [tpl] = listTemplates(db);
		expect(tpl.name).toBe('Обычная неделя');

		applySource(db, W2, W2, 'empty');
		applySource(db, W2, W2, `template:${tpl.id}`);
		expect(getPlan(db, W2)!.items[1]).toHaveLength(7);
		expect(getPlan(db, W2)!.items[4]).toEqual(['2026-11-09', '2026-11-13', '2026-11-14']);
		expect(getPlan(db, W2)!.status).toBe('draft');

		applySource(db, W2, W2, 'empty');
		applySource(db, W2, W2, `week:${W1}`);
		expect(getPlan(db, W2)!.items[1]).toHaveLength(7);
		expect(() => applySource(db, W2, W2, 'week:2026-10-25')).toThrow(InputError);
	});
});

describe('plan editing', () => {
	it('past days are locked; today and later can change', () => {
		const db = setup();
		ensureCurrentPlan(db, W1, W1);
		const wed = '2026-11-04';
		expect(() => setPlanItem(db, W1, wed, 4, '2026-11-02', false)).toThrow('Прошедшие дни плана не редактируются');
		setPlanItem(db, W1, wed, 2, wed, true);
		setPlanRow(db, W1, wed, 4, 'clear');
		expect(getPlan(db, W1)!.items).toEqual({ 2: [wed], 4: ['2026-11-02'] });
	});

	it('usual days put piano exactly on Mon, Fri, Sat', () => {
		const db = setup();
		applySource(db, W1, W1, 'empty');
		setPlanRow(db, W1, W1, 4, 'default');
		expect(getPlan(db, W1)!.items[4]).toEqual(['2026-11-02', '2026-11-06', '2026-11-07']);
	});
});

describe('week summary', () => {
	it('counts planned, done of planned, and bonus', () => {
		const db = setup();
		ensureCurrentPlan(db, W1, W1); // piano Mon, Fri, Sat
		setEntry(db, 4, '2026-11-02', 1); // planned, done
		setEntry(db, 4, '2026-11-03', 1); // not planned: bonus
		setEntry(db, 1, '2026-11-03', 2); // below min: neither
		expect(weekSummary(db, W1)).toEqual({ planned: 3, done: 1, bonus: 1 });
		expect(pastWeeks(db, W2)).toEqual([{ weekStart: W1, planned: 3, done: 1, bonus: 1 }]);
	});
});
