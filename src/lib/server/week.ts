import { and, asc, between, eq, gte, isNull, lte, max, sql } from 'drizzle-orm';
import { addDays, weekStart, type DateStr } from '../dates.js';
import type { WeekData } from '../types.js';
import type { Db } from './db.js';
import { ensureCurrentPlan, parseDays } from './plan.js';
import { openMilestones } from './milestones.js';
import { reviewPending } from './review.js';
import { categories, entries, formats, goals, planItems, practices, weekPlans } from './schema.js';

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
			goalOrder: goals.sortOrder,
			categoryId: categories.id,
			categoryName: categories.name,
			categoryOrder: categories.sortOrder,
			formatId: formats.id,
			formatName: formats.name,
			formatOrder: formats.sortOrder,
			defaultDays: practices.defaultDays,
			note: practices.note,
			noteUpdatedAt: practices.noteUpdatedAt,
			showNoteFull: practices.showNoteFull,
			checklistMarks: practices.checklistMarks,
			recommended: practices.recommended,
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

	const plan = ensureCurrentPlan(db, start, today);
	return {
		start,
		practices: rows.map((r) => ({
			...r,
			note: r.note ? JSON.parse(r.note) : null,
			defaultDays: parseDays(r.defaultDays),
			lastDone: last.get(r.id) ?? null
		})),
		entries: map,
		plan,
		pausedWeeks: pausedWeeks(db, [...new Set(rows.map((r) => r.goalId))], today),
		milestones: openMilestones(db, today),
		reviewPending: reviewPending(db, today)
	};
}

/**
 * Spec 010 «Ротация: пауза по плану»: for each goal, the weeks up to today's that have a plan with none of the
 * goal's practices in it. Weeks without a plan row (before planning started) are not pauses.
 */
export function pausedWeeks(db: Db, goalIds: number[], today: DateStr): Record<number, DateStr[]> {
	const weeks = db
		.select({ start: weekPlans.weekStart })
		.from(weekPlans)
		.where(lte(weekPlans.weekStart, weekStart(today)))
		.all()
		.map((r) => r.start);
	const inPlan = new Set(
		db
			.selectDistinct({ start: weekPlans.weekStart, goalId: practices.goalId })
			.from(planItems)
			.innerJoin(weekPlans, eq(weekPlans.id, planItems.weekPlanId))
			.innerJoin(practices, eq(practices.id, planItems.practiceId))
			.all()
			.map((r) => `${r.goalId}|${r.start}`)
	);
	const out: Record<number, DateStr[]> = {};
	for (const g of goalIds) {
		const paused = weeks.filter((w) => !inPlan.has(`${g}|${w}`));
		if (paused.length) out[g] = paused;
	}
	return out;
}
