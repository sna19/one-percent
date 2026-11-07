import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { categories, entries, goals, practices } from './schema.js';
import { setEntry } from './entries.js';

function setup() {
	const { db } = openDb(':memory:');
	const [c] = db.insert(categories).values({ name: 'Развитие', color: 'blue' }).returning().all();
	const [g] = db.insert(goals).values({ title: 'HBR', categoryId: c.id }).returning().all();
	const [p] = db
		.insert(practices)
		.values({ goalId: g.id, title: 'HBR', unit: 'pages', minDose: 1, normDose: 3 })
		.returning()
		.all();
	return { db, practiceId: p.id };
}

describe('setEntry', () => {
	it('keeps one entry per practice and day; a repeat updates amount', () => {
		const { db, practiceId } = setup();
		setEntry(db, practiceId, '2026-11-07', 3);
		setEntry(db, practiceId, '2026-11-07', 3);
		setEntry(db, practiceId, '2026-11-07', 1);
		const rows = db.select().from(entries).all();
		expect(rows).toHaveLength(1);
		expect(rows[0].amount).toBe(1);
	});

	it('separate days are separate entries', () => {
		const { db, practiceId } = setup();
		setEntry(db, practiceId, '2026-11-06', 3);
		setEntry(db, practiceId, '2026-11-07', 3);
		expect(db.select().from(entries).all()).toHaveLength(2);
	});
});

describe('seedIfEmpty', async () => {
	const { seedIfEmpty } = await import('./seed.js');
	it('creates four practices once', () => {
		const { db } = openDb(':memory:');
		seedIfEmpty(db);
		seedIfEmpty(db);
		expect(db.select().from(practices).all().map((p) => p.title)).toEqual([
			'Итальянский',
			'Английский вслух',
			'HBR',
			'Спорт'
		]);
	});
});
