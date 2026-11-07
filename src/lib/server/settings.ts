import { and, asc, desc, eq, isNull, max } from 'drizzle-orm';
import { paletteKeys } from '../palette.js';
import type { Db } from './db.js';
import { categories, goals, practices } from './schema.js';

export class InputError extends Error {}

const now = () => new Date().toISOString();

function str(f: FormData, k: string, required = true): string {
	const v = String(f.get(k) ?? '').trim();
	if (required && !v) throw new InputError('Заполните все поля');
	if (v.length > 200) throw new InputError('Слишком длинное значение');
	return v;
}

function num(f: FormData, k: string): number {
	const v = Number(String(f.get(k) ?? '').replace(',', '.'));
	if (!Number.isFinite(v) || v <= 0) throw new InputError('Минимум и норма — положительные числа');
	return v;
}

function id(f: FormData, k = 'id'): number | undefined {
	const raw = f.get(k);
	if (raw === null || raw === '') return undefined;
	const v = Number(raw);
	if (!Number.isInteger(v) || v <= 0) throw new InputError('Неверный идентификатор');
	return v;
}

const need = (v: number | undefined, what: string) => {
	if (v === undefined) throw new InputError(`Выберите ${what}`);
	return v;
};

export function loadSettings(db: Db) {
	return {
		categories: db.select().from(categories).orderBy(asc(categories.id)).all(),
		goals: db.select().from(goals).orderBy(asc(goals.id)).all(),
		practices: db.select().from(practices).orderBy(asc(practices.sortOrder), asc(practices.id)).all()
	};
}

export function saveCategory(db: Db, f: FormData) {
	const values = { name: str(f, 'name'), color: str(f, 'color') };
	if (!paletteKeys.includes(values.color as never)) throw new InputError('Цвет только из палитры');
	const cid = id(f);
	if (cid) db.update(categories).set(values).where(eq(categories.id, cid)).run();
	else db.insert(categories).values(values).run();
}

export function saveGoal(db: Db, f: FormData) {
	const values = {
		title: str(f, 'title'),
		categoryId: need(id(f, 'categoryId'), 'категорию'),
		direction: str(f, 'direction', false),
		milestoneText: str(f, 'milestoneText', false)
	};
	const gid = id(f);
	if (gid) db.update(goals).set(values).where(eq(goals.id, gid)).run();
	else db.insert(goals).values(values).run();
}

export function savePractice(db: Db, f: FormData) {
	const values = {
		title: str(f, 'title'),
		goalId: need(id(f, 'goalId'), 'цель'),
		unit: str(f, 'unit'),
		minDose: num(f, 'minDose'),
		normDose: num(f, 'normDose')
	};
	if (values.minDose > values.normDose) throw new InputError('Минимум не может быть больше нормы');
	const pid = id(f);
	if (pid) db.update(practices).set(values).where(eq(practices.id, pid)).run();
	else {
		const [{ m }] = db.select({ m: max(practices.sortOrder) }).from(practices).all();
		db.insert(practices).values({ ...values, sortOrder: (m ?? -1) + 1 }).run();
	}
}

const tables = { category: categories, goal: goals, practice: practices } as const;

/** Archive hides an item everywhere but keeps its history; restore brings it back. */
export function setArchived(db: Db, f: FormData, archived: boolean) {
	const kind = String(f.get('kind')) as keyof typeof tables;
	const t = tables[kind];
	if (!t) throw new InputError('Неизвестный тип');
	const rid = need(id(f), 'элемент');
	db.update(t)
		.set({ archivedAt: archived ? now() : null })
		.where(eq(t.id, rid))
		.run();
}

/** Swaps a practice with its active neighbour above (-1) or below (+1). */
export function movePractice(db: Db, f: FormData) {
	const pid = need(id(f), 'практику');
	const dir = Number(f.get('dir')) < 0 ? -1 : 1;
	const cur = db.select().from(practices).where(eq(practices.id, pid)).get();
	if (!cur) return;
	const list = db
		.select()
		.from(practices)
		.where(isNull(practices.archivedAt))
		.orderBy(dir < 0 ? desc(practices.sortOrder) : asc(practices.sortOrder), dir < 0 ? desc(practices.id) : asc(practices.id))
		.all();
	const i = list.findIndex((p) => p.id === pid);
	const other = list[i + 1];
	if (i < 0 || !other) return;
	db.transaction((tx) => {
		// normalise so neighbours never share an order value
		const all = tx.select().from(practices).orderBy(asc(practices.sortOrder), asc(practices.id)).all();
		all.forEach((p, n) => tx.update(practices).set({ sortOrder: n * 2 }).where(eq(practices.id, p.id)).run());
		const a = tx.select().from(practices).where(eq(practices.id, cur.id)).get()!;
		const b = tx.select().from(practices).where(eq(practices.id, other.id)).get()!;
		tx.update(practices).set({ sortOrder: b.sortOrder }).where(eq(practices.id, a.id)).run();
		tx.update(practices).set({ sortOrder: a.sortOrder }).where(and(eq(practices.id, b.id))).run();
	});
}
