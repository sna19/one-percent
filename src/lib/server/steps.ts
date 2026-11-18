import { and, asc, desc, eq, gte, isNotNull, isNull, max, or } from 'drizzle-orm';
import { isDateStr } from '../dates.js';
import { isEmptyNote, isNoteDoc, NOTE_MAX, sanitizeLinks } from '../note.js';
import type { StepView } from '../steps.js';
import type { Db } from './db.js';
import { goals, practices, steps } from './schema.js';
import { InputError } from './settings.js';

/**
 * #28 — steps: one-off tasks of a goal; «нет бесхозных задач» — a step always has its goal.
 * #30: a step is a «дело»: of a goal of growth or of a sphere of life; it may have a deadline.
 */

const view = (r: typeof steps.$inferSelect & { goalTitle: string; goalKind: string; goalImageKind: string; goalImageValue: string }): StepView => ({
	id: r.id,
	goalId: r.goalId,
	goalTitle: r.goalTitle,
	goalKind: r.goalKind,
	goalImageKind: r.goalImageKind,
	goalImageValue: r.goalImageValue,
	practiceId: r.practiceId,
	title: r.title,
	plannedDate: r.plannedDate,
	dueDate: r.dueDate,
	note: r.note ? JSON.parse(r.note) : null,
	sortOrder: r.sortOrder,
	createdAt: r.createdAt,
	doneAt: r.doneAt
});

function select(db: Db) {
	return db
		.select({
			id: steps.id,
			goalId: steps.goalId,
			practiceId: steps.practiceId,
			title: steps.title,
			plannedDate: steps.plannedDate,
			dueDate: steps.dueDate,
			note: steps.note,
			sortOrder: steps.sortOrder,
			createdAt: steps.createdAt,
			doneAt: steps.doneAt,
			goalTitle: goals.title,
			goalKind: goals.kind,
			goalImageKind: goals.imageKind,
			goalImageValue: goals.imageValue
		})
		.from(steps)
		.innerJoin(goals, eq(goals.id, steps.goalId));
}

/**
 * Open steps of active goals — for «Сегодня» and the cards; #30: and those done in the last day and a half, so that
 * «Сделано» shows today's deeds struck through until the day ends (the device picks its own today).
 */
export function openSteps(db: Db, now = new Date()): StepView[] {
	const since = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();
	return select(db)
		.where(and(or(isNull(steps.doneAt), gte(steps.doneAt, since)), isNull(goals.archivedAt)))
		.orderBy(asc(steps.goalId), asc(steps.sortOrder), asc(steps.id))
		.all()
		.map(view);
}

/** A goal's steps: open ones in order, done ones (its «Пройденный путь») newest first. */
export function goalSteps(db: Db, goalId: number) {
	return {
		open: select(db).where(and(eq(steps.goalId, goalId), isNull(steps.doneAt))).orderBy(asc(steps.sortOrder), asc(steps.id)).all().map(view),
		done: select(db).where(and(eq(steps.goalId, goalId), isNotNull(steps.doneAt))).orderBy(desc(steps.doneAt)).all().map(view)
	};
}

const title = (t: unknown) => {
	const v = typeof t === 'string' ? t.trim() : '';
	if (!v) throw new InputError('Пустое дело');
	if (v.length > 300) throw new InputError('Дело — коротко, до 300 символов');
	return v;
};

function checkPractice(db: Db, goalId: number, practiceId: unknown): number | null {
	if (practiceId === null || practiceId === undefined || practiceId === '') return null;
	const p = db.select().from(practices).where(eq(practices.id, Number(practiceId))).get();
	if (!p || p.goalId !== goalId) throw new InputError('Практика не из этой цели');
	return p.id;
}

const dateOrNull = (v: unknown) => {
	if (v === null || v === undefined || v === '') return null;
	if (!isDateStr(v)) throw new InputError('Неверная дата');
	return v as string;
};

export function createStep(
	db: Db,
	b: { goalId: unknown; practiceId?: unknown; title: unknown; note?: unknown; plannedDate?: unknown; dueDate?: unknown }
): number {
	const goalId = Number(b.goalId);
	if (!db.select({ id: goals.id }).from(goals).where(eq(goals.id, goalId)).get()) throw new InputError('Цель или сфера не найдена');
	const practiceId = checkPractice(db, goalId, b.practiceId);
	const last = db.select({ m: max(steps.sortOrder) }).from(steps).where(eq(steps.goalId, goalId)).get()?.m ?? 0;
	const [s] = db
		.insert(steps)
		.values({
			goalId,
			practiceId,
			title: title(b.title),
			note: noteJson(b.note),
			plannedDate: dateOrNull(b.plannedDate),
			dueDate: dateOrNull(b.dueDate),
			sortOrder: last + 1
		})
		.returning()
		.all();
	return s.id;
}

function noteJson(n: unknown): string | null {
	if (n === null || n === undefined) return null;
	if (!isNoteDoc(n)) throw new InputError('Заметка в неверном формате');
	const d = sanitizeLinks(n);
	if (isEmptyNote(d) && !JSON.stringify(d).includes('"taskItem"')) return null;
	const j = JSON.stringify(d);
	if (j.length > NOTE_MAX) throw new InputError('Заметка слишком длинная');
	return j;
}

function get(db: Db, id: number) {
	const s = db.select().from(steps).where(eq(steps.id, id)).get();
	if (!s) throw new InputError('Дело не найдено');
	return s;
}

/** Title, practice, day and note; only the fields given change. */
export function updateStep(db: Db, id: number, b: Record<string, unknown>) {
	const s = get(db, id);
	const set: Partial<typeof steps.$inferInsert> = {};
	if ('title' in b) set.title = title(b.title);
	if ('practiceId' in b) set.practiceId = checkPractice(db, s.goalId, b.practiceId);
	if ('plannedDate' in b) set.plannedDate = dateOrNull(b.plannedDate);
	if ('dueDate' in b) set.dueDate = dateOrNull(b.dueDate);
	// a deed moves to another goal or sphere; its practice link goes with the old goal
	if ('goalId' in b && Number(b.goalId) !== s.goalId) {
		const g = db.select({ id: goals.id }).from(goals).where(eq(goals.id, Number(b.goalId))).get();
		if (!g) throw new InputError('Цель или сфера не найдена');
		set.goalId = g.id;
		set.practiceId = null;
	}
	if ('note' in b) set.note = noteJson(b.note);
	db.update(steps).set(set).where(eq(steps.id, id)).run();
}

/** Done — or back («Вернуть»): it returns to the place it had. */
export function setStepDone(db: Db, id: number, done: boolean) {
	get(db, id);
	db.update(steps).set({ doneAt: done ? new Date().toISOString() : null }).where(eq(steps.id, id)).run();
}

/** «Убрать» — the step was not needed. */
export function deleteStep(db: Db, id: number) {
	get(db, id);
	db.delete(steps).where(eq(steps.id, id)).run();
}

export function orderSteps(db: Db, ids: unknown) {
	if (!Array.isArray(ids) || !ids.every(Number.isInteger)) throw new InputError('Ожидается список дел');
	db.transaction((tx) => ids.forEach((id, i) => tx.update(steps).set({ sortOrder: i + 1 }).where(eq(steps.id, id as number)).run()));
}

/**
 * #30 «Превратить в дело»: a practice that is really a one-off (a yearly date, a repair) becomes a deed of a sphere
 * or goal — its title and note go with it; the practice goes to the archive with its history.
 */
export function practiceToDeed(db: Db, practiceId: unknown, goalId: unknown, plannedDate?: unknown): number {
	const p = db.select().from(practices).where(eq(practices.id, Number(practiceId))).get();
	if (!p || p.archivedAt) throw new InputError('Практика не найдена');
	return db.transaction((tx) => {
		const id = createStep(tx as unknown as Db, {
			goalId,
			title: p.title,
			note: p.note ? JSON.parse(p.note) : null,
			plannedDate
		});
		tx.update(practices).set({ archivedAt: new Date().toISOString() }).where(eq(practices.id, p.id)).run();
		return id;
	});
}
