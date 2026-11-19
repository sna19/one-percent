import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { addDays, weekDays, weekStart, type DateStr } from '../dates.js';
import type { Db } from './db.js';
import { categories, entries, formats, goals, milestones, planItems, planTemplates, practices, steps, volumesDone, weekPlans } from './schema.js';
import { progressUntil } from './milestones.js';
import { richFirst } from '../note.js';
import type { StepView } from '../steps.js';

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
		startDate: DateStr;
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
	/** #26: the tiers of the screen */
	categoryId: number;
	/** ★ — in this week's focus (Spec 010) */
	focus: boolean;
	/** has practices in this week's plan */
	inWeek: boolean;
	/** out of this week's plan but planned in one of the 4 weeks before — paused by rotation */
	rotation: boolean;
	/** a practice with a volume (#24): «142 / 320 стр» */
	volume: string | null;
	/** #31 (the goals screen as a finder): growth | area */
	kind: 'growth' | 'area';
	/** the goal's live practices with their format, to open them from the goal's row */
	practices: { id: number; title: string; formatId: number | null; format: string | null }[];
	/** open deeds, to open them from the row */
	deeds: StepView[];
	/** the last day with any mark of its practices or a deed done — how fresh the movement is */
	lastTouch: DateStr | null;
	createdAt: string;
}

export interface Gallery {
	categories: { id: number; name: string; color: string; goals: GalleryGoal[] }[];
	/** #26: this week's focus in its order, and the week template it was built from */
	focus: number[];
	template: string | null;
	/** «Пройденный путь»: archived goals, newest first */
	path: GalleryGoal[];
	/** #30: spheres of life — a compact block at the bottom, with their open deeds */
	areas: { id: number; title: string; imageKind: 'icon' | 'emoji' | 'text'; imageValue: string; color: string; open: number }[];
	/** #31: the spheres as full cards too, for the finder (search, groupings, opening in place) */
	areaGoals: GalleryGoal[];
	formats: { id: number; name: string }[];
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
	// #26: rotation — goals planned in the 4 weeks before this one
	const earlier = new Set(
		db
			.select({ p: planItems.practiceId })
			.from(planItems)
			.where(and(gte(planItems.date, addDays(start, -28)), lte(planItems.date, addDays(start, -1))))
			.all()
			.map((r) => byPractice.get(r.p)?.goalId)
	);
	const focusIds = (plan?.focusGoalIds ?? '').split(',').filter(Boolean).map(Number);
	const templateId = plan?.source.startsWith('template:') ? Number(plan.source.slice(9)) : null;
	const template = templateId ? (db.select().from(planTemplates).where(eq(planTemplates.id, templateId)).get()?.name ?? null) : null;
	const open = new Map(db.select().from(milestones).where(eq(milestones.status, 'open')).all().map((m) => [m.goalId, m]));
	const achieved = new Map<number, number>();
	for (const m of db.select({ g: milestones.goalId }).from(milestones).where(eq(milestones.status, 'achieved')).all())
		achieved.set(m.g, (achieved.get(m.g) ?? 0) + 1);
	// #24: a volume gone through (a book read) is an achievement of its goal too
	for (const v of db.select({ g: volumesDone.goalId }).from(volumesDone).all()) achieved.set(v.g, (achieved.get(v.g) ?? 0) + 1);

	const fmtName = new Map(db.select().from(formats).all().map((f) => [f.id, f.name]));
	const allSteps = db.select().from(steps).all();
	const lastMark = new Map<number, string>();
	for (const m of marks) if (m.a > 0) {
		const gid = byPractice.get(m.p)?.goalId;
		if (gid !== undefined && (lastMark.get(gid) ?? '') < m.d) lastMark.set(gid, m.d);
	}
	for (const st of allSteps) if (st.doneAt) {
		const d = st.doneAt.slice(0, 10);
		if ((lastMark.get(st.goalId) ?? '') < d) lastMark.set(st.goalId, d);
	}

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
						startDate: m.startDate,
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
			archivedAt: g.archivedAt,
			categoryId: g.categoryId,
			focus: focusIds.includes(g.id),
			inWeek: inPlan.has(g.id),
			rotation: !inPlan.has(g.id) && earlier.has(g.id),
			volume: volumeLine(mine),
			kind: g.kind,
			practices: mine
				.filter((p) => !p.archivedAt)
				.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
				.map((p) => ({ id: p.id, title: p.title, formatId: p.formatId, format: p.formatId ? (fmtName.get(p.formatId) ?? null) : null })),
			deeds: allSteps
				.filter((st) => st.goalId === g.id && !st.doneAt)
				.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
				.map((st) => ({
					id: st.id,
					goalId: g.id,
					goalTitle: g.title,
					goalKind: g.kind,
					goalImageKind: g.imageKind,
					goalImageValue: g.imageValue,
					practiceId: st.practiceId,
					title: st.title,
					plannedDate: st.plannedDate,
					dueDate: st.dueDate,
					note: st.note ? JSON.parse(st.note) : null,
					showNoteFull: st.showNoteFull,
					sortOrder: st.sortOrder,
					createdAt: st.createdAt,
					doneAt: st.doneAt
				})),
			lastTouch: lastMark.get(g.id) ?? null,
			createdAt: g.createdAt
		};
	}

	function volumeLine(mine: typeof ps): string | null {
		const p = mine.find((x) => !x.archivedAt && x.volumeTotal != null && x.volumeSince);
		if (!p) return null;
		const pos = p.volumeStart + marks.filter((m) => m.p === p.id && m.d >= p.volumeSince!).reduce((sum, m) => sum + m.a, 0);
		const r = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
		return `${r(Math.min(pos, p.volumeTotal!))} / ${r(p.volumeTotal!)} ${p.unit}`;
	}

	const live = all.filter((g) => !g.archivedAt && g.status === 'active');
	const active = live.filter((g) => g.kind !== 'area');
	const openDeeds = new Map<number, number>();
	for (const s of db.select({ g: steps.goalId }).from(steps).where(isNull(steps.doneAt)).all()) openDeeds.set(s.g, (openDeeds.get(s.g) ?? 0) + 1);
	return {
		areas: live
			.filter((g) => g.kind === 'area')
			.map((g) => ({ id: g.id, title: g.title, imageKind: g.imageKind, imageValue: g.imageValue, color: catColor.get(g.categoryId) ?? 'slate', open: openDeeds.get(g.id) ?? 0 })),
		areaGoals: live.filter((g) => g.kind === 'area').map(card),
		formats: db.select().from(formats).where(isNull(formats.archivedAt)).orderBy(asc(formats.sortOrder), asc(formats.id)).all().map((f) => ({ id: f.id, name: f.name })),
		focus: focusIds.filter((id) => active.some((g) => g.id === id)),
		template,
		categories: cats.map((c) => ({ id: c.id, name: c.name, color: c.color, goals: active.filter((g) => g.categoryId === c.id).map(card) })).filter((c) => c.goals.length),
		path: all
			.filter((g) => g.archivedAt && g.kind !== 'area')
			.sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
			.map(card)
	};
}

