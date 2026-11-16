import { and, asc, eq, isNull, max } from 'drizzle-orm';
import { noteLinks, type NoteDoc } from '../note.js';
import type { Db } from './db.js';
import { categories, goals, practices } from './schema.js';
import { InputError } from './settings.js';

/**
 * #27 — «Ссылки»: the links of marked practices, read from their standing notes (never copied), so a note
 * edit changes the tab at once. Day notes are not looked at.
 */
export interface LinkGroup {
	practiceId: number;
	title: string;
	goalTitle: string;
	color: string;
	links: { text: string; href: string }[];
}

export function linkGroups(db: Db): LinkGroup[] {
	return db
		.select({
			id: practices.id,
			title: practices.title,
			note: practices.note,
			goalTitle: goals.title,
			color: categories.color
		})
		.from(practices)
		.innerJoin(goals, eq(goals.id, practices.goalId))
		.innerJoin(categories, eq(categories.id, goals.categoryId))
		.where(and(eq(practices.inLinks, true), isNull(practices.archivedAt), isNull(goals.archivedAt)))
		.orderBy(asc(practices.linksOrder), asc(practices.id))
		.all()
		.map((p) => ({
			practiceId: p.id,
			title: p.title,
			goalTitle: p.goalTitle,
			color: p.color,
			links: noteLinks(p.note ? (JSON.parse(p.note) as NoteDoc) : null)
		}));
}

/** The link icon: on — the practice joins the tab at the end; off — it leaves. */
export function setInLinks(db: Db, practiceId: number, on: boolean) {
	const p = db.select().from(practices).where(eq(practices.id, practiceId)).get();
	if (!p) throw new InputError('Практика не найдена');
	const last = db.select({ m: max(practices.linksOrder) }).from(practices).where(eq(practices.inLinks, true)).get()?.m ?? 0;
	db.update(practices)
		.set({ inLinks: on, ...(on && !p.inLinks ? { linksOrder: last + 1 } : {}) })
		.where(eq(practices.id, practiceId))
		.run();
}

/** «Порядок» on the tab: the groups in the order shown. */
export function setLinksOrder(db: Db, ids: unknown) {
	if (!Array.isArray(ids) || !ids.every(Number.isInteger)) throw new InputError('Ожидается список практик');
	db.transaction((tx) => {
		ids.forEach((id, i) => tx.update(practices).set({ linksOrder: i + 1 }).where(eq(practices.id, id as number)).run());
	});
}
