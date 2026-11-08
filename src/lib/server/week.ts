import { and, asc, between, eq, gte, isNull, lte, max, sql } from 'drizzle-orm';
import { addDays, type DateStr } from '../dates.js';
import type { WeekData } from '../types.js';
import type { Db } from './db.js';
import { categories, entries, formats, goals, practices } from './schema.js';

export function loadWeek(db: Db, start: DateStr, today: DateStr): WeekData {
	const rows = db
		.select({
			id: practices.id,
			title: practices.title,
			unit: practices.unit,
			minDose: practices.minDose,
			normDose: practices.normDose,
			color: categories.color,
			goalId: goals.id,
			goalTitle: goals.title,
			formatId: formats.id,
			formatName: formats.name,
			formatOrder: formats.sortOrder,
			createdOn: sql<string>`substr(${practices.createdAt}, 1, 10)`
		})
		.from(practices)
		.innerJoin(goals, eq(goals.id, practices.goalId))
		.innerJoin(categories, eq(categories.id, goals.categoryId))
		.leftJoin(formats, and(eq(formats.id, practices.formatId), isNull(formats.archivedAt)))
		.where(
			and(
				isNull(practices.archivedAt),
				isNull(goals.archivedAt),
				isNull(categories.archivedAt),
				eq(goals.status, 'active')
			)
		)
		.orderBy(asc(practices.sortOrder), asc(practices.id))
		.all();

	const last = new Map(
		db
			.select({ id: entries.practiceId, d: max(entries.date) })
			.from(entries)
			.innerJoin(practices, eq(practices.id, entries.practiceId))
			.where(and(gte(entries.amount, practices.minDose), lte(entries.date, today)))
			.groupBy(entries.practiceId)
			.all()
			.map((r) => [r.id, r.d])
	);

	const map: WeekData['entries'] = {};
	for (const e of db
		.select()
		.from(entries)
		.where(between(entries.date, start, addDays(start, 6)))
		.all()) {
		(map[e.practiceId] ??= {})[e.date] = e.amount;
	}

	return {
		start,
		practices: rows.map((r) => ({ ...r, lastDone: last.get(r.id) ?? null })),
		entries: map
	};
}
