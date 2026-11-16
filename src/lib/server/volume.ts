import { and, desc, eq, gte, lt, lte, sum } from 'drizzle-orm';
import { isDateStr, type DateStr } from '../dates.js';
import type { Db } from './db.js';
import { entries, practices, volumesDone } from './schema.js';
import { InputError } from './settings.js';

/**
 * #24 — a practice with a volume (a book): how far along it is is counted from the marks, never typed in,
 * except «Я на стр. N», which shifts the start so the position is N now.
 */

function practice(db: Db, id: number) {
	const p = db.select().from(practices).where(eq(practices.id, id)).get();
	if (!p || p.archivedAt) throw new InputError('Практика не найдена');
	return p;
}

/** Marked amounts of the practice from `since` up to `until` (inclusive). */
function marked(db: Db, practiceId: number, since: DateStr, until: DateStr): number {
	const r = db
		.select({ s: sum(entries.amount) })
		.from(entries)
		.where(and(eq(entries.practiceId, practiceId), gte(entries.date, since), lte(entries.date, until)))
		.get();
	return Number(r?.s ?? 0);
}

export interface VolumeView {
	total: number;
	since: DateStr;
	/** position without today's marks — the screen adds today's amount itself, so a mark moves the bar at once */
	before: number;
	doneOn: DateStr | null;
}

/** The volume of each practice that has one, for the week data. */
export function volumes(db: Db, today: DateStr): Record<number, VolumeView> {
	const out: Record<number, VolumeView> = {};
	for (const p of db.select().from(practices).all()) {
		if (p.volumeTotal == null || !p.volumeSince) continue;
		const before =
			p.volumeStart +
			Number(
				db
					.select({ s: sum(entries.amount) })
					.from(entries)
					.where(and(eq(entries.practiceId, p.id), gte(entries.date, p.volumeSince), lt(entries.date, today)))
					.get()?.s ?? 0
			);
		out[p.id] = { total: p.volumeTotal, since: p.volumeSince, before, doneOn: p.volumeDoneOn };
	}
	return out;
}

export function position(db: Db, practiceId: number, today: DateStr): number {
	const p = practice(db, practiceId);
	if (p.volumeTotal == null || !p.volumeSince) return 0;
	return p.volumeStart + marked(db, practiceId, p.volumeSince, today);
}

const checkTotal = (total: unknown) => {
	const t = Number(total);
	if (!Number.isFinite(t) || t <= 0) throw new InputError('Объём — число больше нуля');
	return t;
};
const checkPos = (n: unknown) => {
	const v = Number(n ?? 0);
	if (!Number.isFinite(v) || v < 0) throw new InputError('Позиция — число не меньше нуля');
	return v;
};

/**
 * «Объём» and «Начато с» on the practice screen. `total` null makes the practice endless again. A new
 * volume starts counting today; changing the volume of a running one keeps its position.
 */
export function setVolume(db: Db, practiceId: number, total: unknown, at: unknown, today: DateStr) {
	if (!isDateStr(today)) throw new InputError('Неверная дата');
	const p = practice(db, practiceId);
	if (total === null || total === '') {
		db.update(practices).set({ volumeTotal: null, volumeStart: 0, volumeSince: null, volumeDoneOn: null }).where(eq(practices.id, practiceId)).run();
		return;
	}
	const t = checkTotal(total);
	const since = p.volumeSince ?? today;
	const pos = at === undefined || at === null || at === '' ? (p.volumeSince ? position(db, practiceId, today) : 0) : checkPos(at);
	db.update(practices)
		.set({ volumeTotal: t, volumeSince: since, volumeStart: pos - marked(db, practiceId, since, today) })
		.where(eq(practices.id, practiceId))
		.run();
}

/** «Я на стр. N»: the position becomes N now; the marks are not touched. */
export function setPosition(db: Db, practiceId: number, n: unknown, today: DateStr) {
	const p = practice(db, practiceId);
	if (p.volumeTotal == null || !p.volumeSince) throw new InputError('У практики нет объёма');
	const v = checkPos(n);
	db.update(practices)
		.set({ volumeStart: v - marked(db, practiceId, p.volumeSince, today) })
		.where(eq(practices.id, practiceId))
		.run();
}

/** The volume is gone through: written to the goal's «Пройденный путь» once. Returns the days it took. */
export function finishVolume(db: Db, practiceId: number, today: DateStr): { days: number; total: number } | null {
	const p = practice(db, practiceId);
	if (p.volumeTotal == null || !p.volumeSince || p.volumeDoneOn) return null;
	if (position(db, practiceId, today) < p.volumeTotal) return null;
	db.transaction((tx) => {
		tx.insert(volumesDone)
			.values({ practiceId, goalId: p.goalId, label: p.title, total: p.volumeTotal!, unit: p.unit, startedOn: p.volumeSince!, finishedOn: today })
			.run();
		tx.update(practices).set({ volumeDoneOn: today }).where(eq(practices.id, practiceId)).run();
	});
	const days = Math.round((Date.parse(today) - Date.parse(p.volumeSince)) / 86_400_000) + 1;
	return { days, total: p.volumeTotal };
}

/**
 * «Следующая книга»: a new volume from zero, minimum and norm stay. Today's marks belong to the finished
 * one. The new name, if given, becomes the practice's title.
 */
export function nextVolume(db: Db, practiceId: number, total: unknown, title: unknown, today: DateStr) {
	practice(db, practiceId);
	const t = checkTotal(total);
	const name = typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : undefined;
	db.update(practices)
		.set({ volumeTotal: t, volumeSince: today, volumeStart: -marked(db, practiceId, today, today), volumeDoneOn: null, ...(name ? { title: name } : {}) })
		.where(eq(practices.id, practiceId))
		.run();
}

/** «Закончить практику»: to the archive (history stays, the finished volume stays in the path). */
export function endPractice(db: Db, practiceId: number) {
	practice(db, practiceId);
	db.update(practices).set({ archivedAt: new Date().toISOString() }).where(eq(practices.id, practiceId)).run();
}

/** A goal's finished volumes, newest first. */
export function goalVolumesDone(db: Db, goalId: number) {
	return db.select().from(volumesDone).where(eq(volumesDone.goalId, goalId)).orderBy(desc(volumesDone.finishedOn), desc(volumesDone.id)).all();
}

