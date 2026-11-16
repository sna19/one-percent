import { describe, expect, it } from 'vitest';
import { buildTree, goalOrder, moveGoal, movePractice, practiceOrder, treeOfPractices } from './tree.js';

const P = (id: number, goalId: number, archivedAt: string | null = null) => ({
	id, goalId, archivedAt, title: `p${id}`, formatId: null, unit: 'мин', minDose: 1, normDose: 2
});
const tree = buildTree(
	[{ id: 1, name: 'Развитие', color: 'blue', archivedAt: null }, { id: 2, name: 'Здоровье', color: 'green', archivedAt: null }, { id: 3, name: 'X', color: 'slate', archivedAt: 'x' }],
	[{ id: 10, title: 'Итальянский', categoryId: 1, archivedAt: null }, { id: 11, title: 'HBR', categoryId: 1, archivedAt: null }, { id: 12, title: 'Спорт', categoryId: 2, archivedAt: null }, { id: 13, title: 'old', categoryId: 3, archivedAt: null }],
	[P(1, 10), P(2, 10), P(3, 11), P(4, 12), P(5, 12), P(6, 12, 'x')]
);

describe('settings tree', () => {
	it('builds active categories → goals → practices', () => {
		expect(tree.map((c) => [c.name, c.goals.map((g) => [g.title, g.practices.map((p) => p.id)])])).toEqual([
			['Развитие', [['Итальянский', [1, 2]], ['HBR', [3]]]],
			['Здоровье', [['Спорт', [4, 5]]]]
		]);
		expect(practiceOrder(tree)).toEqual([1, 2, 3, 4, 5]);
	});
	it('moves a practice to another goal and position', () => {
		const t = movePractice(tree, 5, 10, 1);
		expect(practiceOrder(t)).toEqual([1, 5, 2, 3, 4]);
		expect(t[0].goals[0].practices[1].goalId).toBe(10);
	});
	it('moves a goal with its practices to another category', () => {
		const t = moveGoal(tree, 11, 2, 0);
		expect(goalOrder(t)).toEqual([10, 11, 12]);
		expect(t[1].goals.map((g) => g.id)).toEqual([11, 12]);
		expect(practiceOrder(t)).toEqual([1, 2, 3, 4, 5]);
	});
});

describe('treeOfPractices (#12)', () => {
	const pv = (id: number, goalId: number, goalOrder: number, categoryId: number, categoryOrder: number) => ({
		id,
		goalId,
		goalTitle: `g${goalId}`,
		goalOrder,
		categoryId,
		categoryName: `c${categoryId}`,
		categoryOrder,
		color: 'blue'
	});
	it('groups by category and goal in their own order; practices keep the given order', () => {
		const t = treeOfPractices([pv(1, 20, 2, 2, 1), pv(2, 10, 1, 1, 0), pv(3, 20, 2, 2, 1), pv(4, 30, 0, 2, 1)]);
		expect(t.map((c) => [c.id, c.goals.map((g) => [g.id, g.practices.map((p) => p.id)])])).toEqual([
			[1, [[10, [2]]]],
			[2, [[30, [4]], [20, [1, 3]]]]
		]);
		expect(treeOfPractices([])).toEqual([]);
	});
});

describe('#25 filterTree', async () => {
	const { filterTree } = await import('./tree.js');
	const t = [
		{ id: 1, name: 'Развитие', color: 'blue', goals: [
			{ id: 10, title: 'Итальянский', categoryId: 1, practices: [{ id: 100, title: 'Аудиокнига', star: false }, { id: 101, title: 'Разговор', star: true }] },
			{ id: 11, title: 'Чтение', categoryId: 1, practices: [{ id: 110, title: 'Книга на ночь', star: false }] }
		] },
		{ id: 2, name: 'Здоровье', color: 'green', goals: [{ id: 20, title: 'Спорт', categoryId: 2, practices: [{ id: 200, title: 'Бег', star: true }] }] }
	];
	it('search by practice, goal or category name; ё = е; nothing else changes without a filter', () => {
		expect(filterTree(t, {})).toBe(t);
		expect(filterTree(t, { query: 'книг' }).flatMap((c) => c.goals.flatMap((g) => g.practices.map((p) => p.id)))).toEqual([100, 110]);
		expect(filterTree(t, { query: 'итальян' })[0].goals[0].practices).toHaveLength(2);
		expect(filterTree(t, { query: 'здоровье' }).map((c) => c.id)).toEqual([2]);
	});
	it('chips keep matching practices; goal picking keeps empty goals', () => {
		expect(filterTree(t, { keep: [(p) => p.star] }).flatMap((c) => c.goals.map((g) => g.id))).toEqual([10, 20]);
		expect(filterTree(t, { query: 'спорт', goalsOnly: true }).flatMap((c) => c.goals.map((g) => g.id))).toEqual([20]);
	});
});
