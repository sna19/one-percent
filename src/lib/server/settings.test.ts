import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { InputError, loadSettings, movePractice, savePractice, setArchived } from './settings.js';
import { loadWeek } from './week.js';

const form = (o: Record<string, string | number>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, String(v));
	return f;
};

function setup() {
	const { db } = openDb(':memory:');
	seedIfEmpty(db);
	return db;
}

describe('settings', () => {
	it('adds a practice at the end and rejects min > norm', () => {
		const db = setup();
		savePractice(db, form({ title: 'Медитация', goalId: 1, unit: 'мин', minDose: 2, normDose: 10 }));
		expect(loadWeek(db, '2026-11-01', '2026-11-07').practices.at(-1)?.title).toBe('Медитация');
		expect(() => savePractice(db, form({ title: 'X', goalId: 1, unit: 'мин', minDose: 5, normDose: 2 }))).toThrow(
			InputError
		);
	});

	it('archived practice, goal or category leaves the main screen and comes back on restore', () => {
		const db = setup();
		const titles = () => loadWeek(db, '2026-11-01', '2026-11-07').practices.map((p) => p.title);
		setArchived(db, form({ kind: 'practice', id: 3 }), true);
		expect(titles()).not.toContain('HBR');
		setArchived(db, form({ kind: 'practice', id: 3 }), false);
		expect(titles()).toContain('HBR');
		setArchived(db, form({ kind: 'category', id: 2 }), true);
		expect(titles()).not.toContain('Спорт');
	});

	it('moves a practice up and down', () => {
		const db = setup();
		const order = () => loadSettings(db).practices.map((p) => p.id);
		movePractice(db, form({ id: 3, dir: -1 }));
		expect(order()).toEqual([1, 3, 2, 4]);
		movePractice(db, form({ id: 1, dir: -1 }));
		expect(order()).toEqual([1, 3, 2, 4]);
		movePractice(db, form({ id: 1, dir: 1 }));
		expect(order()).toEqual([3, 1, 2, 4]);
	});
});
