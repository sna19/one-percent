import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { addDays, isDateStr, type DateStr } from '../dates.js';
import { isNoteDoc, isEmptyNote, NOTE_MAX, sanitizeLinks } from '../note.js';
import type { MilestoneView } from '../milestones.js';
import type { Db } from './db.js';
import { entries, goals, milestones, practices } from './schema.js';
import { InputError } from './settings.js';

/** Spec 009 — milestones: one open per goal, progress and pace counted from the marks. */

type Row = typeof milestones.$inferSelect;
export const TITLE_MAX = 40;

/**
 * Progress from start_date up to `until` (inclusive): sessions = days with any practice of the goal at
 * or above its minimum; amount = sum of the amounts of the goal's practices whose unit is the budget unit.
 */
export function progressUntil(db: Db, m: Row, until: DateStr): number {
	if (m.budgetKind === 'none' || until < m.startDate) return 0;
	const rows = db
		.select({ date: entries.date, amount: entries.amount, min: practices.minDose, unit: practices.unit })
		.from(entries)
		.innerJoin(practices, eq(practices.id, entries.practiceId))
		.where(and(eq(practices.goalId, m.goalId), gte(entries.date, m.startDate), lte(entries.date, until)))
		.all();
	if (m.budgetKind === 'sessions') return new Set(rows.filter((r) => r.amount > 0 && r.amount >= r.min).map((r) => r.date)).size;
	return rows.filter((r) => r.unit === m.budgetUnit).reduce((s, r) => s + r.amount, 0);
}

function view(db: Db, m: Row, today: DateStr): MilestoneView {
	return {
		id: m.id,
		goalId: m.goalId,
		title: m.title,
		criterion: m.criterion ? JSON.parse(m.criterion) : null,
		dueDate: m.dueDate,
		startDate: m.startDate,
		budgetKind: m.budgetKind,
		budgetUnit: m.budgetUnit,
		budgetTarget: m.budgetTarget,
		status: m.status,
		closedAt: m.closedAt,
		reviewNote: m.reviewNote,
		snoozedUntil: m.snoozedUntil,
		// the client adds today's marks itself, so a mark shows its effect at once (the flash)
		progressBefore: m.status === 'open' ? progressUntil(db, m, addDays(today, -1)) : progressUntil(db, m, m.closedAt?.slice(0, 10) ?? today)
	};
}

/** Open milestones of all goals, for the cards, the flash and the due-date check on «Сегодня». */
export function openMilestones(db: Db, today: DateStr): Record<number, MilestoneView> {
	const out: Record<number, MilestoneView> = {};
	for (const m of db.select().from(milestones).where(eq(milestones.status, 'open')).all()) out[m.goalId] = view(db, m, today);
	return out;
}

/** The goal screen: the open milestone, the history, and per-practice share of the progress. */
export function goalMilestones(db: Db, goalId: number, today: DateStr) {
	const all = db.select().from(milestones).where(eq(milestones.goalId, goalId)).orderBy(desc(milestones.createdAt), desc(milestones.id)).all();
	const open = all.find((m) => m.status === 'open');
	const shares: { practiceId: number; title: string; value: number }[] = [];
	if (open && open.budgetKind !== 'none') {
		for (const p of db.select().from(practices).where(eq(practices.goalId, goalId)).orderBy(asc(practices.sortOrder)).all()) {
			const rows = db
				.select({ date: entries.date, amount: entries.amount })
				.from(entries)
				.where(and(eq(entries.practiceId, p.id), gte(entries.date, open.startDate), lte(entries.date, today)))
				.all();
			const value =
				open.budgetKind === 'sessions'
					? rows.filter((r) => r.amount > 0 && r.amount >= p.minDose).length
					: p.unit === open.budgetUnit
						? rows.reduce((s, r) => s + r.amount, 0)
						: 0;
			if (value || !p.archivedAt) shares.push({ practiceId: p.id, title: p.title, value });
		}
	}
	return {
		open: open ? view(db, open, today) : null,
		/** what today adds is counted on the screen; here the whole progress up to today */
		progress: open ? progressUntil(db, open, today) : 0,
		shares,
		history: all.filter((m) => m.status !== 'open').map((m) => view(db, m, today)),
		units: [...new Set(db.select({ u: practices.unit }).from(practices).where(eq(practices.goalId, goalId)).all().map((r) => r.u))]
	};
}

function fields(b: Record<string, unknown>, today: DateStr) {
	const title = typeof b.title === 'string' ? b.title.trim() : '';
	if (!title) throw new InputError('Нужно короткое имя майлстона');
	if (title.length > TITLE_MAX) throw new InputError(`Имя — до ${TITLE_MAX} символов: оно стоит на карточке`);
	let criterion: string | null = null;
	if (b.criterion != null) {
		if (!isNoteDoc(b.criterion)) throw new InputError('Критерий в неверном формате');
		const doc = sanitizeLinks(b.criterion);
		criterion = isEmptyNote(doc) ? null : JSON.stringify(doc);
		if (criterion && criterion.length > NOTE_MAX) throw new InputError('Критерий слишком длинный');
	}
	const startDate = b.startDate == null || b.startDate === '' ? today : b.startDate;
	if (!isDateStr(startDate)) throw new InputError('Неверная дата начала');
	const dueDate = b.dueDate == null || b.dueDate === '' ? null : b.dueDate;
	if (dueDate !== null && (!isDateStr(dueDate) || dueDate < startDate)) throw new InputError('Срок — не раньше начала');
	const kind = b.budgetKind ?? 'none';
	if (kind !== 'none' && kind !== 'sessions' && kind !== 'amount') throw new InputError('Неверный бюджет');
	let budgetUnit: string | null = null;
	let budgetTarget: number | null = null;
	if (kind !== 'none') {
		budgetTarget = Number(b.budgetTarget);
		if (!Number.isFinite(budgetTarget) || budgetTarget <= 0) throw new InputError('Бюджет — число больше нуля');
		if (kind === 'amount') {
			if (typeof b.budgetUnit !== 'string' || !b.budgetUnit.trim()) throw new InputError('Выбери единицу бюджета');
			budgetUnit = b.budgetUnit.trim();
		}
	}
	return { title, criterion, startDate, dueDate, budgetKind: kind as Row['budgetKind'], budgetUnit, budgetTarget };
}

function get(db: Db, id: number): Row {
	const m = db.select().from(milestones).where(eq(milestones.id, id)).get();
	if (!m) throw new InputError('Майлстон не найден');
	return m;
}

export function createMilestone(db: Db, goalId: number, b: Record<string, unknown>, today: DateStr): number {
	if (!db.select({ id: goals.id }).from(goals).where(eq(goals.id, goalId)).get()) throw new InputError('Цель не найдена');
	if (db.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.goalId, goalId), eq(milestones.status, 'open'))).get())
		throw new InputError('У цели уже есть открытый майлстон');
	const [m] = db.insert(milestones).values({ goalId, ...fields(b, today) }).returning().all();
	return m.id;
}

export function updateMilestone(db: Db, id: number, b: Record<string, unknown>, today: DateStr) {
	const m = get(db, id);
	db.update(milestones).set(fields({ startDate: m.startDate, ...b }, today)).where(eq(milestones.id, id)).run();
}

/** «Да» → achieved, «Нет» → missed (with the diagnosis), or dropped. */
export function closeMilestone(db: Db, id: number, status: 'achieved' | 'missed' | 'dropped', reviewNote: unknown) {
	const m = get(db, id);
	if (m.status !== 'open') throw new InputError('Майлстон уже закрыт');
	const note = typeof reviewNote === 'string' && reviewNote.trim() ? reviewNote.trim().slice(0, 2000) : null;
	db.update(milestones).set({ status, reviewNote: note, closedAt: new Date().toISOString() }).where(eq(milestones.id, id)).run();
}

/** «Новый срок»: the same milestone open again with a new date; the review note stays. */
export function reopenMilestone(db: Db, id: number, dueDate: unknown) {
	const m = get(db, id);
	if (!isDateStr(dueDate) || dueDate < m.startDate) throw new InputError('Неверный новый срок');
	if (db.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.goalId, m.goalId), eq(milestones.status, 'open'))).get())
		throw new InputError('У цели уже есть открытый майлстон');
	db.update(milestones).set({ status: 'open', dueDate, closedAt: null, snoozedUntil: null }).where(eq(milestones.id, id)).run();
}

/** «Позже» on the due-date card: hidden until tomorrow. */
export function snoozeMilestone(db: Db, id: number, today: DateStr) {
	get(db, id);
	db.update(milestones).set({ snoozedUntil: addDays(today, 1) }).where(eq(milestones.id, id)).run();
}

/** Open milestones whose date has come and that are not put off: the due-date card shows the first. */
export function dueMilestones(db: Db, today: DateStr) {
	return db
		.select()
		.from(milestones)
		.where(and(eq(milestones.status, 'open'), lte(milestones.dueDate, today)))
		.orderBy(asc(milestones.dueDate))
		.all()
		.filter((m) => !m.snoozedUntil || m.snoozedUntil <= today);
}

