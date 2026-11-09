import { asc, eq, max } from 'drizzle-orm';
import { paletteKeys } from '../palette.js';
import type { Db } from './db.js';
import { categories, formats, goals, planTemplates, practices } from './schema.js';
import { getPlanLimit, setPlanLimit } from './plan.js';

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

/** Weekday checkboxes (0 Sun … 6 Sat) → '1,5,6', or null for none. */
function days(f: FormData): string | null {
	const ds = [...new Set(f.getAll('defaultDays').map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
	return ds.length ? ds.sort().join(',') : null;
}

const need = (v: number | undefined, what: string) => {
	if (v === undefined) throw new InputError(`Выберите ${what}`);
	return v;
};

export function loadSettings(db: Db) {
	return {
		categories: db.select().from(categories).orderBy(asc(categories.id)).all(),
		goals: db.select().from(goals).orderBy(asc(goals.id)).all(),
		formats: db.select().from(formats).orderBy(asc(formats.sortOrder), asc(formats.id)).all(),
		templates: db.select().from(planTemplates).orderBy(asc(planTemplates.name)).all(),
		planLimit: getPlanLimit(db),
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
		formatId: id(f, 'formatId') ?? null,
		defaultDays: days(f),
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

export function saveFormat(db: Db, f: FormData) {
	const name = str(f, 'name');
	const fid = id(f);
	if (fid) db.update(formats).set({ name }).where(eq(formats.id, fid)).run();
	else {
		const [{ m }] = db.select({ m: max(formats.sortOrder) }).from(formats).all();
		db.insert(formats).values({ name, sortOrder: (m ?? -1) + 1 }).run();
	}
}

export function saveTemplate(db: Db, f: FormData) {
	const tid = need(id(f), 'шаблон');
	db.update(planTemplates).set({ name: str(f, 'name') }).where(eq(planTemplates.id, tid)).run();
}

export function savePlanLimit(db: Db, f: FormData) {
	const raw = String(f.get('limit') ?? '').trim();
	setPlanLimit(db, raw ? Number(raw) : null);
}

const tables = { category: categories, goal: goals, practice: practices, format: formats, template: planTemplates } as const;

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

const ordered = { practice: practices, format: formats } as const;

/** Swaps a practice or a format with its active neighbour above (-1) or below (+1). */
export function moveItem(db: Db, f: FormData) {
	const t = ordered[(String(f.get('kind') ?? 'practice')) as keyof typeof ordered];
	if (!t) throw new InputError('Неизвестный тип');
	const rid = need(id(f), 'элемент');
	const dir = Number(f.get('dir')) < 0 ? -1 : 1;
	db.transaction((tx) => {
		// normalise so neighbours never share an order value
		const all = tx.select({ id: t.id, archivedAt: t.archivedAt }).from(t).orderBy(asc(t.sortOrder), asc(t.id)).all();
		all.forEach((r, n) => tx.update(t).set({ sortOrder: n }).where(eq(t.id, r.id)).run());
		const i = all.findIndex((r) => r.id === rid);
		if (i < 0 || all[i].archivedAt) return;
		let j = i + dir;
		while (j >= 0 && j < all.length && all[j].archivedAt) j += dir;
		if (j < 0 || j >= all.length) return;
		tx.update(t).set({ sortOrder: j }).where(eq(t.id, all[i].id)).run();
		tx.update(t).set({ sortOrder: i }).where(eq(t.id, all[j].id)).run();
	});
}
