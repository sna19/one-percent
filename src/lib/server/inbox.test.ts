import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { goals, planItems, practices } from './schema.js';
import { closeItem, createItem, dayChoices, editItem, listInbox, openCount, restoreItem, toDayNote, toNewGoal, toNewPractice, toPracticeNote } from './inbox.js';
import { plainToDoc } from '../inbox.js';
import { applySource } from './plan.js';
import { checklistStats } from '../note.js';

function setup() {
	const { db } = openDb(':memory:');
	seedIfEmpty(db);
	let n = 0;
	const add = (text: string) => createItem(db, { clientId: `client-${++n}-xxxx`, text: plainToDoc(text), createdAt: new Date().toISOString() });
	return { db, add };
}

describe('inbox (Spec 008)', () => {
	it('a write is idempotent by clientId and lists newest first', () => {
		const { db, add } = setup();
		const a = add('первая');
		createItem(db, { clientId: a.clientId, text: plainToDoc('первая'), createdAt: a.createdAt });
		add('вторая');
		expect(openCount(db)).toBe(2);
		expect(() => add('   ')).toThrow();
	});

	it('done, delete, history and restore', () => {
		const { db, add } = setup();
		const a = add('сделать звонок');
		const b = add('мусор');
		closeItem(db, a.id!, 'done');
		closeItem(db, b.id!, 'deleted');
		const l = listInbox(db);
		expect(l.open).toHaveLength(0);
		expect(l.history.map((h) => h.status).sort()).toEqual(['deleted', 'done']);
		restoreItem(db, a.id!);
		expect(listInbox(db).open.map((o) => o.id)).toEqual([a.id]);
		// history older than 30 days is not shown
		expect(listInbox(db, new Date(Date.now() + 31 * 86_400_000)).history).toHaveLength(0);
		expect(() => closeItem(db, b.id!, 'done')).toThrow();
	});

	it('edit before sorting', () => {
		const { db, add } = setup();
		const a = add('опечтка');
		editItem(db, a.id!, plainToDoc('опечатка'));
		expect(listInbox(db).open[0].text.content?.[0].content?.[0].text).toBe('опечатка');
	});

	it('into the practice note as a checklist item', () => {
		const { db, add } = setup();
		toPracticeNote(db, add('слово дня: allora').id!, 1);
		toPracticeNote(db, add('ещё слово').id!, 1);
		const p = db.select().from(practices).where(eq(practices.id, 1)).get()!;
		expect(checklistStats(JSON.parse(p.note!))).toEqual({ total: 2, checked: 0 });
		expect(listInbox(db).history[0].target).toContain('Заметка «Всегда»');
	});

	it('into a day note; offers to plan the day first', () => {
		const { db, add } = setup();
		const T = '2026-11-16';
		applySource(db, '2026-11-15', T, 'empty');
		const a = add('купить базилик');
		expect(() => toDayNote(db, a.id!, 2, '2026-11-17', T, false)).toThrow('not_planned');
		toDayNote(db, a.id!, 2, '2026-11-17', T, true);
		const pi = db.select().from(planItems).where(eq(planItems.practiceId, 2)).get()!;
		expect(pi.date).toBe('2026-11-17');
		expect(checklistStats(JSON.parse(pi.note!)).total).toBe(1);
		// a past day cannot be added to the plan
		expect(() => toDayNote(db, add('x').id!, 3, '2026-11-15', T, true)).toThrow();
	});

	it('new practice and new goal: title is the first paragraph', () => {
		const { db, add } = setup();
		const pid = toNewPractice(db, add('Скетчинг\nпо 10 минут утром').id!, 1);
		const p = db.select().from(practices).where(eq(practices.id, pid)).get()!;
		expect(p.title).toBe('Скетчинг');
		expect(JSON.parse(p.note!).content[0].content[0].text).toBe('по 10 минут утром');
		const gid = toNewGoal(db, add('\nГитара\nхочу играть у костра').id!, 1);
		const g = db.select().from(goals).where(eq(goals.id, gid)).get()!;
		expect([g.title, g.direction]).toEqual(['Гитара', 'хочу играть у костра']);
	});

	it('day choices run to the end of the last planned week, at least next week', () => {
		const { db } = setup();
		const d = dayChoices(db, '2026-11-17');
		expect(d[0]).toBe('2026-11-17');
		expect(d[d.length - 1]).toBe('2026-11-28');
	});
});
