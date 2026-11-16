/** Spec 007 C — the settings tree: categories → goals → practices, and drops inside it. */

export interface TreePractice {
	id: number;
	title: string;
	goalId: number;
	formatId: number | null;
	unit: string;
	minDose: number;
	normDose: number;
}
/** P — what a practice row carries: the settings row, or the Today view (#12). */
export interface TreeGoal<P = TreePractice> {
	id: number;
	title: string;
	categoryId: number;
	practices: P[];
}
export interface TreeCategory<P = TreePractice> {
	id: number;
	name: string;
	color: string;
	goals: TreeGoal<P>[];
}

/**
 * #12 — the same tree for «Сделать что-то ещё», built from the practices left in that list (already in
 * the common order): categories and goals in their settings order; a goal or category with nothing in
 * it is not there at all.
 */
export function treeOfPractices<
	P extends { goalId: number; goalTitle: string; goalOrder: number; categoryId: number; categoryName: string; categoryOrder: number; color: string }
>(ps: P[]): TreeCategory<P>[] {
	const cats = new Map<number, TreeCategory<P> & { order: number }>();
	const goalsById = new Map<number, TreeGoal<P> & { order: number }>();
	for (const p of ps) {
		let c = cats.get(p.categoryId);
		if (!c) cats.set(p.categoryId, (c = { id: p.categoryId, name: p.categoryName, color: p.color, goals: [], order: p.categoryOrder }));
		let g = goalsById.get(p.goalId);
		if (!g) {
			goalsById.set(p.goalId, (g = { id: p.goalId, title: p.goalTitle, categoryId: p.categoryId, practices: [], order: p.goalOrder }));
			c.goals.push(g);
		}
		g.practices.push(p);
	}
	const byOrder = (a: { order: number; id: number }, b: { order: number; id: number }) => a.order - b.order || a.id - b.id;
	return [...cats.values()].sort(byOrder).map(({ order: _, ...c }) => ({
		...c,
		goals: (c.goals as (TreeGoal<P> & { order: number })[]).sort(byOrder).map(({ order: _o, ...g }) => g)
	}));
}

interface Row {
	id: number;
	archivedAt: string | null;
}

/** Active items only, each list in its saved order (the input lists are already ordered). */
export function buildTree(
	categories: (Row & { name: string; color: string })[],
	goals: (Row & { title: string; categoryId: number })[],
	practices: (Row & TreePractice)[]
): TreeCategory[] {
	return categories
		.filter((c) => !c.archivedAt)
		.map((c) => ({
			id: c.id,
			name: c.name,
			color: c.color,
			goals: goals
				.filter((g) => !g.archivedAt && g.categoryId === c.id)
				.map((g) => ({
					id: g.id,
					title: g.title,
					categoryId: g.categoryId,
					practices: practices
						.filter((p) => !p.archivedAt && p.goalId === g.id)
						.map(({ archivedAt: _, ...p }) => p as TreePractice)
				}))
		}));
}

export const practiceOrder = (t: TreeCategory[]) => t.flatMap((c) => c.goals.flatMap((g) => g.practices.map((p) => p.id)));
export const goalOrder = (t: TreeCategory[]) => t.flatMap((c) => c.goals.map((g) => g.id));

/** Moves a practice into goal `goalId` at position `index` (counted without the practice itself). */
export function movePractice(t: TreeCategory[], pid: number, goalId: number, index: number): TreeCategory[] {
	let moving: TreePractice | undefined;
	const without = t.map((c) => ({
		...c,
		goals: c.goals.map((g) => ({
			...g,
			practices: g.practices.filter((p) => {
				if (p.id !== pid) return true;
				moving = p;
				return false;
			})
		}))
	}));
	if (!moving) return t;
	const m = { ...moving, goalId };
	return without.map((c) => ({
		...c,
		goals: c.goals.map((g) => {
			if (g.id !== goalId) return g;
			const ps = [...g.practices];
			ps.splice(Math.max(0, Math.min(index, ps.length)), 0, m);
			return { ...g, practices: ps };
		})
	}));
}

/** Moves a goal (with its practices) into category `categoryId` at position `index`. */
export function moveGoal(t: TreeCategory[], gid: number, categoryId: number, index: number): TreeCategory[] {
	let moving: TreeGoal | undefined;
	const without = t.map((c) => ({
		...c,
		goals: c.goals.filter((g) => {
			if (g.id !== gid) return true;
			moving = g;
			return false;
		})
	}));
	if (!moving) return t;
	const m = { ...moving, categoryId };
	return without.map((c) => {
		if (c.id !== categoryId) return c;
		const gs = [...c.goals];
		gs.splice(Math.max(0, Math.min(index, gs.length)), 0, m);
		return { ...c, goals: gs };
	});
}

/**
 * Where a dragged item lands, from the rows above the pointer (in screen order, the dragged one
 * left out): the last row above decides — a parent header means «first inside it», a sibling row
 * means «right after it».
 */
export function dropTarget(
	rowsAbove: { kind: 'parent' | 'item'; parentId: number }[],
	firstParentId: number,
	countBefore: (parentId: number) => number
): { parentId: number; index: number } {
	const last = rowsAbove.at(-1);
	if (!last) return { parentId: firstParentId, index: 0 };
	if (last.kind === 'parent') return { parentId: last.parentId, index: 0 };
	return { parentId: last.parentId, index: countBefore(last.parentId) };
}

// ── #25: the practice navigator — search and filter chips ──────────────────

export interface TreeFilter<P> {
	/** words of a name; a category or goal that matches keeps all of its practices */
	query?: string;
	/** a practice must pass every predicate given (chips «В плане недели», «★», «В фокусе») */
	keep?: ((p: P, g: TreeGoal<P>) => boolean)[];
	/** goal-level picking: goals stay even with no practice left */
	goalsOnly?: boolean;
}

const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();

/** The tree with only what matches; empty goals and categories drop out (unless picking goals). */
export function filterTree<P extends { title: string }>(tree: TreeCategory<P>[], f: TreeFilter<P>): TreeCategory<P>[] {
	const q = norm(f.query ?? '');
	const keep = f.keep ?? [];
	if (!q && !keep.length) return tree;
	const hit = (s: string) => !q || norm(s).includes(q);
	return tree
		.map((c) => {
			const catHit = q && hit(c.name);
			const goals = c.goals
				.map((g) => {
					const goalHit = catHit || (q && hit(g.title));
					const practices = g.practices.filter((p) => (goalHit || hit(p.title)) && keep.every((k) => k(p, g)));
					return { ...g, practices, hit: goalHit };
				})
				.filter((g) => g.practices.length || (f.goalsOnly && (g.hit || !q) && !keep.length))
				.map(({ hit: _, ...g }) => g);
			return { ...c, goals };
		})
		.filter((c) => c.goals.length);
}

/** #25: the «Архив» chip — what is archived (a practice, or everything under an archived goal or category). */
export function buildArchivedTree(
	categories: (Row & { name: string; color: string })[],
	goals: (Row & { title: string; categoryId: number })[],
	practices: (Row & TreePractice)[]
): TreeCategory[] {
	const cat = new Map(categories.map((c) => [c.id, c]));
	const goal = new Map(goals.map((g) => [g.id, g]));
	const gone = (p: Row & TreePractice) => {
		const g = goal.get(p.goalId);
		return !!(p.archivedAt || g?.archivedAt || (g && cat.get(g.categoryId)?.archivedAt));
	};
	return categories
		.map((c) => ({
			id: c.id,
			name: c.name,
			color: c.color,
			goals: goals
				.filter((g) => g.categoryId === c.id)
				.map((g) => ({
					id: g.id,
					title: g.title,
					categoryId: g.categoryId,
					practices: practices.filter((p) => p.goalId === g.id && gone(p)).map(({ archivedAt: _, ...p }) => p as TreePractice)
				}))
				.filter((g) => g.practices.length)
		}))
		.filter((c) => c.goals.length);
}

/** #26: within each goal the ★ practices go first (a stable sort keeps the rest in order). */
export function starredFirst<P>(t: TreeCategory<P>[]): TreeCategory<P>[] {
	const star = (p: P) => Number(!!(p as { recommended?: boolean }).recommended);
	return t.map((c) => ({ ...c, goals: c.goals.map((g) => ({ ...g, practices: [...g.practices].sort((a, b) => star(b) - star(a)) })) }));
}
