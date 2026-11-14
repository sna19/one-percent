import { and, asc, desc, eq, gte, inArray, isNull, lt, max } from 'drizzle-orm';
import { addDays, isDateStr, weekDays, weekStart, type DateStr } from '../dates.js';
import type { PlanView, WeekSummary } from '../types.js';
import { checklistAmount, isEmptyNote, isNoteDoc, NOTE_MAX, uncheck, type NoteDoc } from '../note.js';
import { setEntry } from './entries.js';
import type { Db } from './db.js';
import {
	appSettings,
	entries,
	planItems,
	planTemplateItems,
	planTemplates,
	practices,
	weekPlans
} from './schema.js';
import { InputError } from './settings.js';

/** Spec 003 — weekly plan. Dates are local 'YYYY-MM-DD'; weeks start on Sunday. */

export type PlanSource = 'previous' | 'empty' | 'default' | `week:${string}` | `template:${number}`;


const weekdayOf = (d: DateStr) => new Date(`${d}T12:00:00Z`).getUTCDay();

export function parseDays(s: string | null | undefined): number[] {
	if (!s) return [];
	return [...new Set(s.split(',').map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).sort();
}

function activePracticeIds(db: Db): Set<number> {
	return new Set(
		db.select({ id: practices.id }).from(practices).where(isNull(practices.archivedAt)).all().map((p) => p.id)
	);
}

function planRow(db: Db, start: DateStr) {
	return db.select().from(weekPlans).where(eq(weekPlans.weekStart, start)).get();
}

export function getPlan(db: Db, start: DateStr): PlanView | null {
	const plan = planRow(db, start);
	if (!plan) return null;
	const items: PlanView['items'] = {};
	const notes: PlanView['notes'] = {};
	for (const it of db
		.select()
		.from(planItems)
		.where(eq(planItems.weekPlanId, plan.id))
		.orderBy(asc(planItems.date))
		.all()) {
		(items[it.practiceId] ??= []).push(it.date);
		if (it.note) notes[`${it.practiceId}|${it.date}`] = { note: JSON.parse(it.note), updatedAt: it.noteUpdatedAt };
	}
	return { weekStart: plan.weekStart, status: plan.status, source: plan.source, items, notes };
}

/** Day note text as stored for a copy: boxes cleared (Spec 006), null when there is none. */
function freshNote(json: string | null | undefined): string | null {
	if (!json) return null;
	return JSON.stringify(uncheck(JSON.parse(json) as NoteDoc));
}

/** (practice, weekday, day note) a source would give; archived practices are skipped. */
function sourcePairs(db: Db, start: DateStr, source: PlanSource): [number, number, string | null][] {
	const active = activePracticeIds(db);
	let pairs: [number, number, string | null][] = [];
	if (source === 'empty') pairs = [];
	else if (source === 'default') {
		for (const p of db.select().from(practices).where(isNull(practices.archivedAt)).all())
			for (const d of parseDays(p.defaultDays)) pairs.push([p.id, d, null]);
	} else if (source === 'previous' || source.startsWith('week:')) {
		const from = source === 'previous' ? addDays(start, -7) : source.slice(5);
		if (!isDateStr(from) || weekStart(from) !== from) throw new InputError('Неверная неделя');
		const plan = planRow(db, from);
		if (!plan) throw new InputError('На ту неделю плана нет');
		for (const it of db.select().from(planItems).where(eq(planItems.weekPlanId, plan.id)).all())
			pairs.push([it.practiceId, weekdayOf(it.date), freshNote(it.note)]);
	} else if (source.startsWith('template:')) {
		const tid = Number(source.slice(9));
		const tpl = db.select().from(planTemplates).where(eq(planTemplates.id, tid)).get();
		if (!tpl) throw new InputError('Шаблон не найден');
		pairs = db
			.select()
			.from(planTemplateItems)
			.where(eq(planTemplateItems.templateId, tid))
			.all()
			.map((t) => [t.practiceId, t.weekday, freshNote(t.note)]);
	} else throw new InputError('Неизвестный источник плана');
	return pairs.filter(([pid]) => active.has(pid));
}

function ensureRow(db: Db, start: DateStr, source: PlanSource) {
	const plan = planRow(db, start);
	if (plan) return plan;
	db.insert(weekPlans).values({ weekStart: start, source }).run();
	return planRow(db, start)!;
}

/** Days of the week that may still change: today and later. Past days are locked. */
function editableDays(start: DateStr, today: DateStr): DateStr[] {
	return weekDays(start).filter((d) => d >= today);
}

/**
 * Fills the plan from a source. Only today and later change: past days keep what was planned,
 * so a miss can't be hidden. The plan becomes a draft until confirmed.
 */
export function applySource(db: Db, start: DateStr, today: DateStr, source: PlanSource) {
	checkWeek(start);
	// «как прошлая неделя» without a last week falls back to the practices' usual days
	if (source === 'previous' && !planRow(db, addDays(start, -7))) source = 'default';
	const pairs = sourcePairs(db, start, source);
	const days = editableDays(start, today);
	db.transaction((tx) => {
		const plan = ensureRow(tx as unknown as Db, start, source);
		if (days.length)
			tx.delete(planItems)
				.where(and(eq(planItems.weekPlanId, plan.id), inArray(planItems.date, days)))
				.run();
		const now = new Date().toISOString();
		for (const [pid, wd, note] of pairs) {
			const date = addDays(start, wd);
			if (date < today) continue;
			tx.insert(planItems)
				.values({ weekPlanId: plan.id, practiceId: pid, date, note, noteUpdatedAt: note ? now : null })
				.onConflictDoNothing()
				.run();
		}
		tx.update(weekPlans).set({ source, status: 'draft', confirmedAt: null }).where(eq(weekPlans.id, plan.id)).run();
	});
}

/**
 * The current week always has a plan: without one, a draft is made from last week's plan,
 * or from the practices' usual days when there is no last week.
 */
export function ensureCurrentPlan(db: Db, start: DateStr, today: DateStr): PlanView | null {
	if (start !== weekStart(today) || planRow(db, start)) return getPlan(db, start);
	const source: PlanSource = planRow(db, addDays(start, -7)) ? 'previous' : 'default';
	// a new week: nothing is past yet except days before today, which stay unplanned
	applySource(db, start, today, source);
	return getPlan(db, start);
}

function checkWeek(start: DateStr) {
	if (!isDateStr(start) || weekStart(start) !== start) throw new InputError('Неделя начинается с воскресенья');
}

function checkEditable(start: DateStr, today: DateStr, date: DateStr) {
	if (!isDateStr(date) || date < start || date > addDays(start, 6)) throw new InputError('Дата вне недели');
	if (date < today) throw new InputError('Прошедшие дни плана не редактируются');
}

function checkPractice(db: Db, practiceId: number) {
	const p = db.select().from(practices).where(eq(practices.id, practiceId)).get();
	if (!p || p.archivedAt) throw new InputError('Практика не найдена');
	return p;
}

export function setPlanItem(db: Db, start: DateStr, today: DateStr, practiceId: number, date: DateStr, planned: boolean) {
	checkWeek(start);
	checkEditable(start, today, date);
	checkPractice(db, practiceId);
	const plan = ensureRow(db, start, 'empty');
	if (planned)
		db.insert(planItems).values({ weekPlanId: plan.id, practiceId, date }).onConflictDoNothing().run();
	else db.delete(planItems).where(and(eq(planItems.practiceId, practiceId), eq(planItems.date, date))).run();
}

/** Row shortcuts: every day, the practice's usual days, or clear — for today and later only. */
export function setPlanRow(
	db: Db,
	start: DateStr,
	today: DateStr,
	practiceId: number,
	mode: 'daily' | 'default' | 'clear'
) {
	checkWeek(start);
	const p = checkPractice(db, practiceId);
	const want = new Set(mode === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : mode === 'default' ? parseDays(p.defaultDays) : []);
	db.transaction((tx) => {
		const plan = ensureRow(tx as unknown as Db, start, 'empty');
		for (const date of editableDays(start, today)) {
			if (want.has(weekdayOf(date)))
				tx.insert(planItems).values({ weekPlanId: plan.id, practiceId, date }).onConflictDoNothing().run();
			else tx.delete(planItems).where(and(eq(planItems.practiceId, practiceId), eq(planItems.date, date))).run();
		}
	});
}

/**
 * Confirms the week's plan. Optionally saves it as a week template: a new one (`templateName`) or
 * replacing an existing one (`replaceTemplateId`, Spec 007 D — id and name stay, contents change).
 * Day notes go into the template with boxes cleared.
 */
export function confirmPlan(db: Db, start: DateStr, templateName?: string, replaceTemplateId?: number) {
	checkWeek(start);
	const plan = ensureRow(db, start, 'empty');
	db.transaction((tx) => {
		tx.update(weekPlans)
			.set({ status: 'confirmed', confirmedAt: new Date().toISOString() })
			.where(eq(weekPlans.id, plan.id))
			.run();
		let tplId: number | undefined;
		if (replaceTemplateId !== undefined) {
			const tpl = tx.select().from(planTemplates).where(eq(planTemplates.id, replaceTemplateId)).get();
			if (!tpl || tpl.archivedAt) throw new InputError('Шаблон недели не найден');
			tx.delete(planTemplateItems).where(eq(planTemplateItems.templateId, tpl.id)).run();
			tplId = tpl.id;
		} else {
			const name = templateName?.trim();
			if (name) {
				if (name.length > 100) throw new InputError('Слишком длинное имя шаблона недели');
				const [{ m }] = tx.select({ m: max(planTemplates.sortOrder) }).from(planTemplates).all();
				const [tpl] = tx.insert(planTemplates).values({ name, sortOrder: (m ?? -1) + 1 }).returning().all();
				tplId = tpl.id;
			}
		}
		if (tplId !== undefined) {
			const active = activePracticeIds(tx as unknown as Db);
			for (const it of tx.select().from(planItems).where(eq(planItems.weekPlanId, plan.id)).all())
				if (active.has(it.practiceId))
					tx.insert(planTemplateItems)
						.values({ templateId: tplId, practiceId: it.practiceId, weekday: weekdayOf(it.date), note: freshNote(it.note) })
						.onConflictDoNothing()
						.run();
		}
	});
}

/** Planned practice-days, how many of them were done (≥ min), and done practice-days without a plan. */
export function weekSummary(db: Db, start: DateStr): WeekSummary {
	const end = addDays(start, 6);
	const planned = new Set(
		db
			.select({ p: planItems.practiceId, d: planItems.date })
			.from(planItems)
			.innerJoin(weekPlans, eq(weekPlans.id, planItems.weekPlanId))
			.where(eq(weekPlans.weekStart, start))
			.all()
			.map((r) => `${r.p}|${r.d}`)
	);
	let done = 0;
	let bonus = 0;
	for (const e of db
		.select({ p: entries.practiceId, d: entries.date, a: entries.amount, min: practices.minDose })
		.from(entries)
		.innerJoin(practices, eq(practices.id, entries.practiceId))
		.where(and(gte(entries.date, start), lt(entries.date, addDays(end, 1))))
		.all()) {
		if (e.a <= 0 || e.a < e.min) continue;
		if (planned.has(`${e.p}|${e.d}`)) done++;
		else bonus++;
	}
	return { planned: planned.size, done, bonus };
}

/** Earlier weeks that have a plan, newest first, with their results — for «Другая неделя». */
export function pastWeeks(db: Db, before: DateStr, limit = 12) {
	return db
		.select({ weekStart: weekPlans.weekStart })
		.from(weekPlans)
		.where(lt(weekPlans.weekStart, before))
		.orderBy(desc(weekPlans.weekStart))
		.limit(limit)
		.all()
		.map((w) => ({ weekStart: w.weekStart, ...weekSummary(db, w.weekStart) }));
}

export function listTemplates(db: Db) {
	return db.select().from(planTemplates).orderBy(asc(planTemplates.sortOrder), asc(planTemplates.id)).all();
}

export function getPlanLimit(db: Db): number | null {
	const v = db.select().from(appSettings).where(eq(appSettings.key, 'plan_limit')).get()?.value;
	const n = Number(v);
	return v && Number.isInteger(n) && n > 0 ? n : null;
}

export function setPlanLimit(db: Db, limit: number | null) {
	if (limit === null) db.delete(appSettings).where(eq(appSettings.key, 'plan_limit')).run();
	else {
		if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) throw new InputError('Лимит — целое число больше нуля');
		db.insert(appSettings)
			.values({ key: 'plan_limit', value: String(limit) })
			.onConflictDoUpdate({ target: appSettings.key, set: { value: String(limit) } })
			.run();
	}
}

/**
 * Spec 006: saves the day note of a planned day; the later change wins. Past days may be edited
 * (a late tick is honest). For a practice marked by checklist the day's mark follows the boxes.
 */
export function setPlanNote(db: Db, practiceId: number, date: DateStr, note: unknown, updatedAt: string): boolean {
	if (!isDateStr(date)) throw new InputError('Неверная дата');
	if (note !== null && !isNoteDoc(note)) throw new InputError('Заметка в неверном формате');
	if (Number.isNaN(Date.parse(updatedAt))) throw new InputError('Неверное время изменения');
	const doc = note as NoteDoc | null;
	const empty = !doc || (isEmptyNote(doc) && !JSON.stringify(doc).includes('"taskItem"'));
	const json = empty ? null : JSON.stringify(doc);
	if (json && json.length > NOTE_MAX) throw new InputError('Заметка слишком длинная');
	const item = db
		.select()
		.from(planItems)
		.where(and(eq(planItems.practiceId, practiceId), eq(planItems.date, date)))
		.get();
	if (!item) throw new InputError('Заметка дня есть только у дня в плане');
	if (item.noteUpdatedAt && item.noteUpdatedAt >= updatedAt) return false;
	db.transaction((tx) => {
		tx.update(planItems).set({ note: json, noteUpdatedAt: updatedAt }).where(eq(planItems.id, item.id)).run();
		const p = tx.select().from(practices).where(eq(practices.id, practiceId)).get();
		if (p?.checklistMarks) {
			const amount = checklistAmount(empty ? null : doc, p);
			if (amount !== null) setEntry(tx as unknown as Db, practiceId, date, amount);
		}
	});
	return true;
}

/**
 * Copies one day's note to the practice's other planned days of the same week, today and later,
 * with boxes cleared (the same rule as copying a week). Past days keep their notes as history.
 * Returns how many days got the note.
 */
export function copyDayNoteToWeek(db: Db, practiceId: number, date: DateStr, today: DateStr): number {
	if (!isDateStr(date)) throw new InputError('Неверная дата');
	const start = weekStart(date);
	const src = db
		.select()
		.from(planItems)
		.where(and(eq(planItems.practiceId, practiceId), eq(planItems.date, date)))
		.get();
	if (!src?.note) throw new InputError('У этого дня нет заметки');
	const fresh = freshNote(src.note);
	const targets = db
		.select()
		.from(planItems)
		.where(and(eq(planItems.practiceId, practiceId), gte(planItems.date, today)))
		.all()
		.filter((it) => it.date !== date && it.date >= start && it.date <= addDays(start, 6));
	const now = new Date().toISOString();
	const p = db.select().from(practices).where(eq(practices.id, practiceId)).get();
	db.transaction((tx) => {
		for (const it of targets) {
			tx.update(planItems).set({ note: fresh, noteUpdatedAt: now }).where(eq(planItems.id, it.id)).run();
			// a fresh checklist on today: the mark follows the cleared boxes
			if (p?.checklistMarks && it.date <= today) {
				const amount = checklistAmount(JSON.parse(fresh!) as NoteDoc, p);
				if (amount !== null) setEntry(tx as unknown as Db, practiceId, it.date, amount);
			}
		}
	});
	return targets.length;
}
