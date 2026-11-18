import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { addDays, weekDays, weekStart, type DateStr } from '../dates.js';
import { counts } from '../rules.js';
import { amountLabel, pace } from '../milestones.js';
import { REVIEW, type FadingRow, type GoalWeek, type MilestoneRow, type WeeklyReview } from '../review.js';
import type { Db } from './db.js';
import { categories, entries, formats, goals, milestones, planItems, practices, weekPlans, weekReviews } from './schema.js';
import { ensureCurrentPlan, getPlanLimit } from './plan.js';
import { progressUntil } from './milestones.js';
import { openSteps } from './steps.js';
import { setting } from './appSettings.js';
import { InputError } from './settings.js';

/** Spec 010 — the weekly review, counted from marks and plans; only the retro answer is stored. */

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function computeReview(db: Db, start: DateStr, today: DateStr): WeeklyReview {
	if (weekStart(start) !== start) throw new InputError('Неделя начинается с воскресенья');
	const end = addDays(start, 6);
	const from = addDays(start, -7 * REVIEW.HISTORY_WEEKS);
	const weeks = Array.from({ length: REVIEW.HISTORY_WEEKS + 1 }, (_, i) => addDays(start, -7 * i)); // [W, W-1, …]

	const ps = db
		.select({
			id: practices.id,
			title: practices.title,
			goalId: practices.goalId,
			unit: practices.unit,
			minDose: practices.minDose,
			normDose: practices.normDose,
			formatId: practices.formatId,
			createdAt: practices.createdAt
		})
		.from(practices)
		.all();
	const gs = db
		.select({ id: goals.id, title: goals.title, categoryId: goals.categoryId, sortOrder: goals.sortOrder, color: categories.color })
		.from(goals)
		.innerJoin(categories, eq(categories.id, goals.categoryId))
		.where(and(isNull(goals.archivedAt), eq(goals.status, 'active'), isNull(categories.archivedAt)))
		.orderBy(asc(categories.sortOrder), asc(goals.sortOrder), asc(goals.id))
		.all();
	const cats = db.select().from(categories).where(isNull(categories.archivedAt)).orderBy(asc(categories.sortOrder), asc(categories.id)).all();

	const plans = new Map(
		db
			.select()
			.from(weekPlans)
			.where(and(gte(weekPlans.weekStart, from), lte(weekPlans.weekStart, start)))
			.all()
			.map((p) => [p.weekStart, p])
	);
	const planned = new Set(
		db
			.select({ p: planItems.practiceId, d: planItems.date })
			.from(planItems)
			.where(and(gte(planItems.date, from), lte(planItems.date, end)))
			.all()
			.map((r) => `${r.p}|${r.d}`)
	);
	const amount = new Map(
		db
			.select({ p: entries.practiceId, d: entries.date, a: entries.amount })
			.from(entries)
			.where(and(gte(entries.date, from), lte(entries.date, end)))
			.all()
			.map((r) => [`${r.p}|${r.d}`, r.a])
	);
	const did = (p: (typeof ps)[number], d: DateStr) => counts(amount.get(`${p.id}|${d}`), p);
	const isPlanned = (p: (typeof ps)[number], d: DateStr) => planned.has(`${p.id}|${d}`);
	const byGoal = new Map<number, typeof ps>();
	for (const p of ps) byGoal.set(p.goalId, [...(byGoal.get(p.goalId) ?? []), p]);

	function goalWeek(g: (typeof gs)[number], w: DateStr) {
		let pl = 0,
			pd = 0,
			bonus = 0,
			done = 0;
		for (const p of byGoal.get(g.id) ?? [])
			for (const d of weekDays(w)) {
				const yes = did(p, d);
				if (yes) done++;
				if (isPlanned(p, d)) {
					pl++;
					if (yes) pd++;
				} else if (yes) bonus++;
			}
		return { planned: pl, plannedDone: pd, bonus, done };
	}
	// Spec 010 «Ротация»: a week with a plan but none of the goal's practices is a pause for it
	const pausedIn = (g: (typeof gs)[number], w: DateStr) => plans.has(w) && goalWeek(g, w).planned === 0;

	const rows: (GoalWeek & { pausedNow: boolean })[] = gs.map((g) => {
		const cur = goalWeek(g, start);
		const born = (byGoal.get(g.id) ?? []).map((p) => p.createdAt.slice(0, 10)).sort()[0] ?? start;
		const earlier = weeks.slice(1).filter((w) => addDays(w, 6) >= born && !pausedIn(g, w));
		const usual = earlier.length ? sum(earlier.map((w) => goalWeek(g, w).done)) / earlier.length : null;
		return { goalId: g.id, title: g.title, categoryId: g.categoryId, color: g.color, ...cur, usual, pausedNow: pausedIn(g, start) };
	});

	const plan = plans.get(start);
	const focusIds = (plan?.focusGoalIds ?? '').split(',').filter(Boolean).map(Number);

	// open milestones: the time left or the lag at the end of the week (or today, if earlier)
	const at = today < end ? today : end;
	const ms = db.select().from(milestones).where(eq(milestones.status, 'open')).all();
	const msText = (goalId: number): string | null => {
		const m = ms.find((x) => x.goalId === goalId);
		if (!m) return null;
		const done = progressUntil(db, m, at);
		const pc = pace(m, done, at);
		if (pc && m.budgetKind !== 'none' && m.budgetTarget && pc.delta < 0) {
			const x = -pc.delta;
			return `${m.title}: отстаёшь на ${m.budgetKind === 'sessions' ? `${Math.round(x)} зан.` : amountLabel(x, m.budgetUnit)}`;
		}
		if (pc && m.budgetKind !== 'none') return `${m.title}: в темпе`;
		return m.dueDate ? `${m.title}: срок ${m.dueDate.slice(8)}.${m.dueDate.slice(5, 7)}` : m.title;
	};

	const active = rows.filter((r) => !r.pausedNow);
	const focus = active.filter((r) => focusIds.includes(r.goalId)).map((r) => ({ ...r, milestone: msText(r.goalId) }));

	const fadingAll: FadingRow[] = [];
	for (const r of active) {
		if (focusIds.includes(r.goalId)) continue;
		if (r.planned > 0 && r.plannedDone === 0) fadingAll.push({ ...r, why: 'plan0', strength: 1 + r.planned / 100 });
		else if (r.usual && r.done < r.usual * REVIEW.FADING_SHARE) fadingAll.push({ ...r, why: 'drop', strength: (r.usual - r.done) / r.usual });
	}
	fadingAll.sort((a, b) => b.strength - a.strength);

	const msRows: (MilestoneRow & { order: number })[] = [];
	for (const m of ms) {
		if (focusIds.includes(m.goalId)) continue;
		const g = rows.find((r) => r.goalId === m.goalId);
		if (!g || g.pausedNow) continue;
		const done = progressUntil(db, m, at);
		const pc = pace(m, done, at);
		const soon = m.dueDate && m.dueDate <= addDays(end, REVIEW.MILESTONE_SOON_DAYS);
		const lag = pc && m.budgetKind !== 'none' && m.budgetTarget && pc.delta < 0;
		if (!soon && !lag) continue;
		const parts: string[] = [];
		if (lag) parts.push(`отстаёшь на ${m.budgetKind === 'sessions' ? `${Math.round(-pc!.delta)} зан.` : amountLabel(-pc!.delta, m.budgetUnit)}`);
		if (soon) parts.push(m.dueDate! <= at ? 'срок наступил' : `срок ${m.dueDate!.slice(8)}.${m.dueDate!.slice(5, 7)}`);
		msRows.push({ goalId: m.goalId, goalTitle: g.title, title: m.title, dueDate: m.dueDate, text: parts.join(', '), order: soon ? 0 : 1 });
	}
	msRows.sort((a, b) => a.order - b.order || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));

	const shown = new Set([...focus.map((r) => r.goalId), ...fadingAll.map((r) => r.goalId), ...msRows.map((r) => r.goalId)]);
	const normal = active.filter((r) => !shown.has(r.goalId));

	// plan by category
	const catRows = cats
		.map((c) => {
			const gw = rows.filter((r) => r.categoryId === c.id && r.planned > 0);
			return { id: c.id, name: c.name, color: c.color, planned: sum(gw.map((r) => r.planned)), done: sum(gw.map((r) => r.plannedDone)), goals: gw };
		})
		.filter((c) => c.planned > 0);

	// realism: by weekday, and practices under half of the plan three weeks running
	const days = weekDays(start).map((d) => {
		const pl = ps.filter((p) => isPlanned(p, d));
		return { date: d, planned: pl.length, done: pl.filter((p) => did(p, d)).length };
	});
	const weakDays = days.filter((d) => d.planned > 0 && d.date <= today && d.done / d.planned < REVIEW.WEAK_DAY).map((d) => d.date);
	const weakPractices = ps
		.filter((p) =>
			weeks.slice(0, REVIEW.WEAK_PRACTICE_WEEKS).every((w) => {
				const pl = weekDays(w).filter((d) => isPlanned(p, d));
				return pl.length > 0 && pl.filter((d) => did(p, d)).length / pl.length < REVIEW.WEAK_DAY;
			})
		)
		.map((p) => p.title);

	// time: only practices counted in minutes, by format
	const fmt = new Map(db.select().from(formats).all().map((f) => [f.id, f.name]));
	const mins = new Map<string, number>();
	for (const p of ps.filter((x) => x.unit === 'мин'))
		for (const d of weekDays(start)) {
			const a = amount.get(`${p.id}|${d}`) ?? 0;
			if (a > 0) {
				const k = (p.formatId && fmt.get(p.formatId)) || 'Без формата';
				mins.set(k, (mins.get(k) ?? 0) + a);
			}
		}
	const time = [...mins.entries()].map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes);

	const limit = getPlanLimit(db);
	const plannedPractices = new Set(ps.filter((p) => weekDays(start).some((d) => isPlanned(p, d))).map((p) => p.id)).size;
	const overload = fadingAll.length > REVIEW.OVERLOAD_FADING || (limit !== null && plannedPractices > limit) ? { activeGoals: rows.length } : null;

	const reviews = new Map(
		db
			.select()
			.from(weekReviews)
			.where(and(gte(weekReviews.weekStart, addDays(start, -7)), lte(weekReviews.weekStart, start)))
			.all()
			.map((r) => [r.weekStart, r])
	);
	const prev = reviews.get(addDays(start, -7));

	return {
		start,
		end,
		weeks: db
			.select({ s: weekPlans.weekStart })
			.from(weekPlans)
			.where(lte(weekPlans.weekStart, weekStart(today)))
			.orderBy(desc(weekPlans.weekStart))
			.limit(26)
			.all()
			.map((r) => r.s),
		previous: prev?.retroText ? { start: prev.weekStart, retroText: prev.retroText, retroResult: prev.retroResult } : null,
		focus,
		fading: fadingAll,
		plan: {
			planned: sum(rows.map((r) => r.planned)),
			done: sum(rows.map((r) => r.plannedDone)),
			bonus: sum(rows.map((r) => r.bonus)),
			categories: catRows
		},
		milestones: msRows,
		days,
		weakDays,
		weakPractices,
		time,
		normal,
		paused: rows.filter((r) => r.pausedNow).map((r) => ({ goalId: r.goalId, title: r.title, supported: r.done > 0 })),
		overload,
		retroText: reviews.get(start)?.retroText ?? '',
		staleStep: (() => {
			const old = openSteps(db)
				.filter((st) => st.createdAt.slice(0, 10) <= addDays(end, -setting(db, 'review.stuck_step_days')))
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
			if (!old) return null;
			const weeks = Math.floor((Date.parse(end) - Date.parse(old.createdAt.slice(0, 10))) / (7 * 86_400_000));
			return { goalId: old.goalId, goalTitle: old.goalTitle, title: old.title, weeks };
		})(),
		noPlan: !plan
	};
}

/** The retro answer of a week, and «Сработало?» for the week before. */
export function saveRetro(db: Db, start: DateStr, b: { retroText?: unknown; retroResult?: unknown }) {
	if (weekStart(start) !== start) throw new InputError('Неделя начинается с воскресенья');
	const set: Partial<typeof weekReviews.$inferInsert> = {};
	if (b.retroText !== undefined) {
		if (typeof b.retroText !== 'string' || b.retroText.length > 4000) throw new InputError('Ретро — текст до 4000 знаков');
		set.retroText = b.retroText.trim() || null;
	}
	if (b.retroResult !== undefined) {
		if (b.retroResult !== null && !['yes', 'partly', 'no'].includes(b.retroResult as string)) throw new InputError('Ответ: да, частично или нет');
		set.retroResult = b.retroResult as 'yes' | 'partly' | 'no' | null;
	}
	db.insert(weekReviews)
		.values({ weekStart: start, ...set })
		.onConflictDoUpdate({ target: weekReviews.weekStart, set })
		.run();
}

export function markViewed(db: Db, start: DateStr) {
	const now = new Date().toISOString();
	db.insert(weekReviews).values({ weekStart: start, viewedAt: now }).onConflictDoUpdate({ target: weekReviews.weekStart, set: { viewedAt: now } }).run();
}

/** «Итоги прошлой недели готовы»: last week had a plan and its review has not been opened. */
export function reviewPending(db: Db, today: DateStr): DateStr | null {
	const last = addDays(weekStart(today), -7);
	if (!db.select({ id: weekPlans.id }).from(weekPlans).where(eq(weekPlans.weekStart, last)).get()) return null;
	const r = db.select().from(weekReviews).where(eq(weekReviews.weekStart, last)).get();
	return r?.viewedAt ? null : last;
}

/**
 * Focus of the week (Spec 010; #26): up to three active goals — the ★ of the «Цели» screen. Owner (2026-11-16):
 * any active goal may be in focus, not only goals of the week's plan. A week without a plan gets its draft first.
 */
export function setFocus(db: Db, start: DateStr, goalIds: unknown, today?: DateStr) {
	if (!Array.isArray(goalIds) || !goalIds.every(Number.isInteger)) throw new InputError('Ожидается список целей');
	const ids = [...new Set(goalIds as number[])];
	const max = setting(db, 'goals.focus_max');
	if (ids.length > max) throw new InputError(`Фокус — не больше ${max} целей`);
	let plan = db.select().from(weekPlans).where(eq(weekPlans.weekStart, start)).get();
	if (!plan && today) {
		ensureCurrentPlan(db, start, today);
		plan = db.select().from(weekPlans).where(eq(weekPlans.weekStart, start)).get();
	}
	if (!plan) throw new InputError('У недели нет плана');
	const active = new Set(db.select({ id: goals.id }).from(goals).where(and(isNull(goals.archivedAt), eq(goals.status, 'active'))).all().map((g) => g.id));
	if (!ids.every((g) => active.has(g))) throw new InputError('В фокус — только активные цели');
	db.update(weekPlans).set({ focusGoalIds: ids.length ? ids.join(',') : null }).where(eq(weekPlans.id, plan.id)).run();
}

/**
 * #29: after «Цели в фокусе» goes below the number of ★ of this week — the goals now in focus, for the screen to
 * ask which to take off; null when it fits.
 */
export function focusOverLimit(db: Db, today?: unknown) {
	const t = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10);
	const plan = db.select().from(weekPlans).where(eq(weekPlans.weekStart, weekStart(t))).get();
	const ids = (plan?.focusGoalIds ?? '').split(',').filter(Boolean).map(Number);
	const max = setting(db, 'goals.focus_max');
	if (ids.length <= max) return null;
	const rows = db.select({ id: goals.id, title: goals.title }).from(goals).all().filter((g) => ids.includes(g.id));
	return { start: weekStart(t), max, goals: ids.map((id) => rows.find((g) => g.id === id)).filter(Boolean) as { id: number; title: string }[] };
}
