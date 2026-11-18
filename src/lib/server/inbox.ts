import { and, desc, eq, gte, ne } from 'drizzle-orm';
import { addDays, isDateStr, weekStart, type DateStr } from '../dates.js';
import { appendTask, splitTitle, type InboxItemView } from '../inbox.js';
import { setting } from './appSettings.js';
import { isNoteDoc, isEmptyNote, NOTE_MAX, sanitizeLinks, type NoteDoc } from '../note.js';
import type { Db } from './db.js';
import { planItems, practices, goals, weekPlans, inboxItems } from './schema.js';
import { InputError, createGoal, createPractice } from './settings.js';
import { setPlanItem } from './plan.js';
import { plainToDoc } from '../inbox.js';
import { dayTitle } from '../today.js';
import { createStep } from './steps.js';

/** Spec 008 — «Входящие»: write in one touch, sort later. */

type Row = typeof inboxItems.$inferSelect;

const view = (r: Row): InboxItemView => ({
	id: r.id,
	clientId: r.clientId,
	text: JSON.parse(r.text),
	createdAt: r.createdAt,
	updatedAt: r.updatedAt,
	status: r.status,
	closedAt: r.closedAt,
	target: r.target
});

function checkText(text: unknown): NoteDoc {
	if (!isNoteDoc(text)) throw new InputError('Запись в неверном формате');
	const doc = sanitizeLinks(text);
	if (isEmptyNote(doc)) throw new InputError('Пустая запись');
	if (JSON.stringify(doc).length > NOTE_MAX) throw new InputError('Запись слишком длинная');
	return doc;
}

const iso = (s: unknown, what: string) => {
	if (typeof s !== 'string' || Number.isNaN(Date.parse(s))) throw new InputError(`Неверное время: ${what}`);
	return new Date(s).toISOString();
};

/** Idempotent by clientId: the offline queue may send the same write twice. */
export function createItem(db: Db, b: { clientId: unknown; text: unknown; createdAt: unknown }): InboxItemView {
	if (typeof b.clientId !== 'string' || !/^[\w-]{8,64}$/.test(b.clientId)) throw new InputError('Неверный clientId');
	const doc = checkText(b.text);
	const at = iso(b.createdAt, 'создания');
	db.insert(inboxItems)
		.values({ clientId: b.clientId, text: JSON.stringify(doc), createdAt: at, updatedAt: at })
		.onConflictDoNothing()
		.run();
	return view(db.select().from(inboxItems).where(eq(inboxItems.clientId, b.clientId)).get()!);
}

/** Open items, newest first; and closed or sorted ones of the last 30 days for «История». */
export function listInbox(db: Db, now = new Date()) {
	const open = db.select().from(inboxItems).where(eq(inboxItems.status, 'open')).orderBy(desc(inboxItems.createdAt)).all();
	const since = new Date(now.getTime() - setting(db, 'inbox.history_days') * 86_400_000).toISOString();
	const history = db
		.select()
		.from(inboxItems)
		.where(and(ne(inboxItems.status, 'open'), gte(inboxItems.closedAt, since)))
		.orderBy(desc(inboxItems.closedAt))
		.all();
	return { open: open.map(view), history: history.map(view) };
}

export function openCount(db: Db): number {
	return db.select({ id: inboxItems.id }).from(inboxItems).where(eq(inboxItems.status, 'open')).all().length;
}

function item(db: Db, id: number, open = true): Row {
	const r = db.select().from(inboxItems).where(eq(inboxItems.id, id)).get();
	if (!r) throw new InputError('Запись не найдена');
	if (open && r.status !== 'open') throw new InputError('Запись уже разобрана');
	return r;
}

/** The text may be corrected before sorting. */
export function editItem(db: Db, id: number, text: unknown) {
	item(db, id);
	const doc = checkText(text);
	db.update(inboxItems).set({ text: JSON.stringify(doc), updatedAt: new Date().toISOString() }).where(eq(inboxItems.id, id)).run();
}

function close(db: Db, id: number, status: 'done' | 'processed' | 'deleted', target: string | null) {
	db.update(inboxItems).set({ status, target, closedAt: new Date().toISOString() }).where(eq(inboxItems.id, id)).run();
}

/** «Сделано» (a two-minute thought, done at once) or «Удалить». */
export function closeItem(db: Db, id: number, status: 'done' | 'deleted') {
	item(db, id);
	close(db, id, status, null);
}

/** From «История» back to the open list. What it was sorted into stays where it went. */
export function restoreItem(db: Db, id: number) {
	const r = item(db, id, false);
	if (r.status === 'open') return;
	db.update(inboxItems).set({ status: 'open', closedAt: null, target: null }).where(eq(inboxItems.id, id)).run();
}

function practice(db: Db, id: number) {
	const p = db.select().from(practices).where(eq(practices.id, id)).get();
	if (!p || p.archivedAt) throw new InputError('Практика не найдена');
	return p;
}

/** «В заметку практики»: a checklist item at the end of the standing note («Всегда»). */
export function toPracticeNote(db: Db, id: number, practiceId: number) {
	const r = item(db, id);
	const p = practice(db, practiceId);
	const note = appendTask(p.note ? (JSON.parse(p.note) as NoteDoc) : null, JSON.parse(r.text));
	const json = JSON.stringify(note);
	if (json.length > NOTE_MAX) throw new InputError('Заметка станет слишком длинной');
	db.transaction((tx) => {
		tx.update(practices).set({ note: json, noteUpdatedAt: new Date().toISOString() }).where(eq(practices.id, practiceId)).run();
		close(tx as unknown as Db, id, 'processed', `Заметка «Всегда»: ${p.title}`);
	});
}

/**
 * «В заметку дня»: a checklist item in the day note of a practice. A day without the practice in its plan
 * is refused unless `addToPlan` (then it is planned first; only today and later can be).
 */
export function toDayNote(db: Db, id: number, practiceId: number, date: DateStr, today: DateStr, addToPlan: boolean) {
	if (!isDateStr(date) || !isDateStr(today)) throw new InputError('Неверная дата');
	const r = item(db, id);
	const p = practice(db, practiceId);
	db.transaction((tx) => {
		const t = tx as unknown as Db;
		const find = () => t.select().from(planItems).where(and(eq(planItems.practiceId, practiceId), eq(planItems.date, date))).get();
		let pi = find();
		if (!pi) {
			if (!addToPlan) throw new InputError('not_planned');
			setPlanItem(t, weekStart(date), today, practiceId, date, true);
			pi = find()!;
		}
		const note = appendTask(pi.note ? (JSON.parse(pi.note) as NoteDoc) : null, JSON.parse(r.text));
		const json = JSON.stringify(note);
		if (json.length > NOTE_MAX) throw new InputError('Заметка станет слишком длинной');
		t.update(planItems).set({ note: json, noteUpdatedAt: new Date().toISOString() }).where(eq(planItems.id, pi.id)).run();
		close(t, id, 'processed', `Заметка дня, ${dayTitle(date)}: ${p.title}`);
	});
}

/** «Новая практика»: title = first paragraph, the rest goes to the standing note. Returns the new practice. */
export function toNewPractice(db: Db, id: number, goalId: number): number {
	const r = item(db, id);
	const { title, rest } = splitTitle(JSON.parse(r.text));
	let pid = 0;
	db.transaction((tx) => {
		const t = tx as unknown as Db;
		pid = createPractice(t, goalId);
		t.update(practices)
			.set({ title: title.slice(0, 200), ...(rest ? { note: JSON.stringify(plainToDoc(rest)), noteUpdatedAt: new Date().toISOString() } : {}) })
			.where(eq(practices.id, pid))
			.run();
		close(t, id, 'processed', `Новая практика: ${title.slice(0, 200)}`);
	});
	return pid;
}

/** «Новая цель»: title = first paragraph, the rest goes to «Направление — зачем». Returns the new goal. */
export function toNewGoal(db: Db, id: number, categoryId: number): number {
	const r = item(db, id);
	const { title, rest } = splitTitle(JSON.parse(r.text));
	let gid = 0;
	db.transaction((tx) => {
		const t = tx as unknown as Db;
		gid = createGoal(t, categoryId);
		t.update(goals).set({ title: title.slice(0, 200), direction: rest }).where(eq(goals.id, gid)).run();
		close(t, id, 'processed', `Новая цель: ${title.slice(0, 200)}`);
	});
	return gid;
}

/** #28 «Шаг цели»: title = first paragraph, the rest is the step's note. Returns the step. */
export function toStep(db: Db, id: number, goalId: number): number {
	const r = item(db, id);
	const { title, rest } = splitTitle(JSON.parse(r.text));
	const g = db.select().from(goals).where(eq(goals.id, goalId)).get();
	if (!g) throw new InputError('Цель не найдена');
	let sid = 0;
	db.transaction((tx) => {
		const t = tx as unknown as Db;
		sid = createStep(t, { goalId, title: title.slice(0, 300), note: rest ? plainToDoc(rest) : null });
		close(t, id, 'processed', `Дело: ${g.title}`);
	});
	return sid;
}

/** Days offered for «В заметку дня»: today up to the end of the last planned week (at least next week). */
export function dayChoices(db: Db, today: DateStr): DateStr[] {
	const last = db.select({ s: weekPlans.weekStart }).from(weekPlans).orderBy(desc(weekPlans.weekStart)).get()?.s;
	const end = [addDays(weekStart(today), 13), last ? addDays(last, 6) : today].sort().pop()!;
	const out: DateStr[] = [];
	for (let d = today; d <= end && out.length < 60; d = addDays(d, 1)) out.push(d);
	return out;
}
