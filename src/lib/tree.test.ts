import { describe, expect, it } from 'vitest';
import { buildTree, goalOrder, moveGoal, movePractice, practiceOrder } from './tree.js';

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
