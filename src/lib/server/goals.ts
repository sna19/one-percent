import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { addDays, weekDays, weekStart, type DateStr } from '../dates.js';
import type { Db } from './db.js';
import { categories, entries, goals, milestones, planItems, practices, volumesDone, weekPlans } from './schema.js';
import { progressUntil } from './milestones.js';
import { richFirst } from '../note.js';

/** Spec 013 B — the «Цели» gallery: every goal with its picture, «why», milestone, week and what went in. */

export interface GalleryGoal {
	id: number;
	title: string;
	imageKind: 'icon' | 'emoji' | 'text';
	imageValue: string;
	color: string;
	/** «Направление — зачем», plain */
	why: string;
	milestone: {
		title: string;
		dueDate: DateStr | null;
		budgetKind: 'none' | 'sessions' | 'amount';
		budgetUnit: string | null;
		budgetTarget: number | null;
		progress: number;
	} | null;
	/** this week, Sunday first: some practice of the goal at or above its minimum */
	week: boolean[];
	/** this week has a plan with none of the goal's practices */
	paused: boolean;
	/** hours when every practice of the goal counts minutes, otherwise days with a mark; never goes down */
	invested: { kind: 'hours' | 'days'; value: number };
	achieved: number;
	archivedAt?: string | null;
}

export interface Gallery {
	categories: { id: number; name: string; color: string; goals: GalleryGoal[] }[];
	/** «Пройденный путь»: archived goals, newest first */
	path: GalleryGoal[];
}

export function gallery(db: Db, today: DateStr): Gallery {
	const start = weekStart(today);
	const days = weekDays(start);
	const cats = db.select().from(categories).where(isNull(categories.archivedAt)).orderBy(asc(categories.sortOrder), asc(categories.id)).all();
	const catColor = new Map(db.select().from(categories).all().map((c) => [c.id, c.color]));
	const all = db.select().from(goals).orderBy(asc(goals.sortOrder), asc(goals.id)).all();
	const ps = db.select().from(practices).all();
	const marks = db
		.select({ p: entries.practiceId, d: entries.date, a: entries.amount })
		.from(entries)
		.where(lte(entries.date, today))
		.all();
	const byPractice = new Map(ps.map((p) => [p.id, p]));
	const plan = db.select().from(weekPlans).where(eq(weekPlans.weekStart, start)).get();
	const inPlan = new Set(
		plan
			? db
					.select({ p: planItems.practiceId })
					.from(planItems)
					.where(and(eq(planItems.weekPlanId, plan.id), gte(planItems.date, start), lte(planItems.date, addDays(start, 6))))
					.all()
					.map((r) => byPractice.get(r.p)?.goalId)
			: []
	);
	const open = new Map(db.select().from(milestones).where(eq(milestones.status, 'open')).all().map((m) => [m.goalId, m]));
	const achieved = new Map<number, number>();
	for (const m of db.select({ g: milestones.goalId }).from(milestones).where(eq(milestones.status, 'achieved')).all())
		achieved.set(m.g, (achieved.get(m.g) ?? 0) + 1);
	// #24: a volume gone through (a book read) is an achievement of its goal too
	for (const v of db.select({ g: volumesDone.goalId }).from(volumesDone).all()) achieved.set(v.g, (achieved.get(v.g) ?? 0) + 1);

	function card(g: (typeof all)[number]): GalleryGoal {
		const mine = ps.filter((p) => p.goalId === g.id);
		const ids = new Set(mine.map((p) => p.id));
		const counted = marks.filter((m) => ids.has(m.p) && m.a > 0 && m.a >= byPractice.get(m.p)!.minDose);
		const doneDays = new Set(counted.map((m) => m.d));
		const minutes = mine.length > 0 && mine.every((p) => p.unit === 'мин');
		const m = open.get(g.id);
		return {
			id: g.id,
			title: g.title,
			imageKind: g.imageKind,
			imageValue: g.imageValue,
			color: catColor.get(g.categoryId) ?? 'slate',
			why: richFirst(g.direction),
			milestone: m
				? {
						title: m.title,
						dueDate: m.dueDate,
						budgetKind: m.budgetKind,
						budgetUnit: m.budgetUnit,
						budgetTarget: m.budgetTarget,
						progress: progressUntil(db, m, today)
					}
				: null,
			week: days.map((d) => doneDays.has(d)),
			paused: !!plan && !inPlan.has(g.id),
			invested: minutes
				? { kind: 'hours', value: marks.filter((x) => ids.has(x.p) && x.a > 0).reduce((s, x) => s + x.a, 0) / 60 }
				: { kind: 'days', value: doneDays.size },
			achieved: achieved.get(g.id) ?? 0,
			archivedAt: g.archivedAt
		};
	}

	const active = all.filter((g) => !g.archivedAt && g.status === 'active');
	return {
		categories: cats.map((c) => ({ id: c.id, name: c.name, color: c.color, goals: active.filter((g) => g.categoryId === c.id).map(card) })).filter((c) => c.goals.length),
		path: all
			.filter((g) => g.archivedAt)
			.sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
			.map(card)
	};
}

