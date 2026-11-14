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
export interface TreeGoal {
	id: number;
	title: string;
	categoryId: number;
	practices: TreePractice[];
}
export interface TreeCategory {
	id: number;
	name: string;
	color: string;
	goals: TreeGoal[];
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
