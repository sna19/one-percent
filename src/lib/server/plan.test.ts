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

describe('previous without a last week', () => {
	it('falls back to usual days', () => {
		const db = setup();
		applySource(db, W1, W1, 'previous');
		expect(getPlan(db, W1)!.source).toBe('default');
		expect(getPlan(db, W1)!.items[4]).toHaveLength(3);
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

describe('day notes (Spec 006)', async () => {
	const { setPlanNote } = await import('./plan.js');
	const { entries } = await import('./schema.js');
	const { checklistStats } = await import('../note.js');
	const task = (t: string, checked: boolean) => ({
		type: 'taskItem',
		attrs: { checked },
		content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }]
	});
	const meals = (...c: boolean[]) => ({
		type: 'doc',
		content: [{ type: 'taskList', content: c.map((x, i) => task(`еда ${i}`, x)) }]
	});
	const T = '2026-11-01T10:00:00.000Z';

	function food() {
		const db = setup();
		// HBR (id 3, min 1, norm 3) marked by checklist; planned Sunday and Monday
		db.update(practices).set({ checklistMarks: true }).where(eq(practices.id, 3)).run();
		applySource(db, W1, W1, 'empty');
		setPlanItem(db, W1, W1, 3, '2026-11-01', true);
		setPlanItem(db, W1, W1, 3, '2026-11-02', true);
		return db;
	}
	const amount = (db: ReturnType<typeof food>, d: string) =>
		db.select().from(entries).all().find((e) => e.practiceId === 3 && e.date === d)?.amount;

	it('checklist sets the day mark by the table', () => {
		const db = food();
		setPlanNote(db, 3, '2026-11-01', meals(true, true, false, false), T);
		expect(amount(db, '2026-11-01')).toBe(1);
		setPlanNote(db, 3, '2026-11-01', meals(true, true, true, true), '2026-11-01T11:00:00.000Z');
		expect(amount(db, '2026-11-01')).toBe(3);
		setPlanNote(db, 3, '2026-11-01', meals(true, false, false, false), '2026-11-01T12:00:00.000Z');
		expect(amount(db, '2026-11-01')).toBe(0);
	});

	it('without the flag or without boxes the mark is left alone', () => {
		const db = food();
		setEntry(db, 3, '2026-11-02', 2);
		setPlanNote(db, 3, '2026-11-02', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'просто текст' }] }] }, T);
		expect(amount(db, '2026-11-02')).toBe(2);
		setPlanItem(db, W1, W1, 1, '2026-11-02', true);
		setPlanNote(db, 1, '2026-11-02', meals(true), T);
		expect(db.select().from(entries).all().some((e) => e.practiceId === 1)).toBe(false);
	});

	it('a day note needs a planned day; the later change wins; past days stay editable', () => {
		const db = food();
		expect(() => setPlanNote(db, 3, '2026-11-03', meals(true), T)).toThrow(InputError);
		expect(setPlanNote(db, 3, '2026-11-01', meals(true), '2026-11-02T00:00:00.000Z')).toBe(true);
		expect(setPlanNote(db, 3, '2026-11-01', meals(false), '2026-11-01T00:00:00.000Z')).toBe(false);
	});

	it('copying a week or a template clears boxes and leaves the source as history', () => {
		const db = food();
		setPlanNote(db, 3, '2026-11-02', meals(true, true, false), T);
		confirmPlan(db, W1, 'Питание');
		applySource(db, W2, W2, 'previous');
		const copied = getPlan(db, W2)!.notes['3|2026-11-09'].note;
		expect(checklistStats(copied)).toEqual({ total: 3, checked: 0 });
		expect(checklistStats(getPlan(db, W1)!.notes['3|2026-11-02'].note)).toEqual({ total: 3, checked: 2 });
		const [tpl] = listTemplates(db);
		applySource(db, '2026-11-15', '2026-11-15', `template:${tpl.id}`);
		expect(checklistStats(getPlan(db, '2026-11-15')!.notes['3|2026-11-16'].note)).toEqual({ total: 3, checked: 0 });
	});
});

describe('copy a day note to the week', async () => {
	const { copyDayNoteToWeek, setPlanNote } = await import('./plan.js');
	const { checklistStats } = await import('../note.js');
	const note = {
		type: 'doc',
		content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'завтрак' }] }] }] }]
	};
	it('copies to later planned days with boxes cleared; past days and other weeks untouched', () => {
		const db = setup();
		applySource(db, W1, W1, 'empty');
		setPlanRow(db, W1, W1, 3, 'daily');
		applySource(db, W2, W1, 'empty');
		setPlanItem(db, W2, W1, 3, '2026-11-09', true);
		setPlanNote(db, 3, '2026-11-03', note, '2026-11-01T00:00:00.000Z');
		setPlanNote(db, 3, '2026-11-02', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'вчера' }] }] }, '2026-11-01T00:00:00.000Z');
		// on Wednesday the 4th: copy Tuesday's note
		expect(copyDayNoteToWeek(db, 3, '2026-11-03', '2026-11-04')).toBe(4); // 4, 5, 6, 7
		const n = getPlan(db, W1)!.notes;
		expect(checklistStats(n['3|2026-11-06'].note)).toEqual({ total: 1, checked: 0 });
		expect(checklistStats(n['3|2026-11-03'].note)).toEqual({ total: 1, checked: 1 });
		expect(JSON.stringify(n['3|2026-11-02'].note)).toContain('вчера');
		expect(getPlan(db, W2)!.notes['3|2026-11-09']).toBeUndefined();
	});
});

describe('week templates (Spec 007 D)', () => {
	it('replacing keeps id and name and changes the contents', () => {
		const db = setup();
		applySource(db, W1, W1, 'empty');
		setPlanRow(db, W1, W1, 1, 'daily');
		confirmPlan(db, W1, 'Обычная');
		const [t] = listTemplates(db);
		applySource(db, W2, W2, 'empty');
		setPlanItem(db, W2, W2, 4, '2026-11-09', true);
		confirmPlan(db, W2, undefined, t.id);
		const after = listTemplates(db);
		expect(after.map((x) => [x.id, x.name])).toEqual([[t.id, 'Обычная']]);
		applySource(db, '2026-11-15', '2026-11-15', `template:${t.id}`);
		expect(getPlan(db, '2026-11-15')!.items).toEqual({ 4: ['2026-11-16'] });
		expect(() => confirmPlan(db, W2, undefined, 999)).toThrow(InputError);
	});
});

describe('next week draft (Spec 007 E)', () => {
	it('opening next week makes a draft from this week; weeks further on stay empty', () => {
		const db = setup();
		ensureCurrentPlan(db, W1, W1);
		setPlanItem(db, W1, W1, 1, '2026-11-03', true);
		const next = ensureCurrentPlan(db, W2, '2026-11-04')!;
		expect(next.status).toBe('draft');
		expect(next.items[1]).toEqual(['2026-11-10']);
		expect(ensureCurrentPlan(db, '2026-11-15', '2026-11-04')).toBeNull();
	});
});

describe('future days get no marks (Spec 007 E)', async () => {
	const { setPlanNote } = await import('./plan.js');
	const { entries } = await import('./schema.js');
	it('ticking a future day note does not mark it', () => {
		const db = setup();
		db.update(practices).set({ checklistMarks: true }).where(eq(practices.id, 3)).run();
		applySource(db, W1, W1, 'empty');
		setPlanItem(db, W1, W1, 3, '2026-11-05', true);
		const full = { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph' }] }] }] };
		setPlanNote(db, 3, '2026-11-05', full, '2026-11-01T10:00:00.000Z', '2026-11-01');
		expect(db.select().from(entries).all()).toHaveLength(0);
	});
});
