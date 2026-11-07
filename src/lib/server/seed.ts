import type { Db } from './db.js';
import { categories, goals, practices } from './schema.js';

/** Owner's four practices (Spec 001; doses for languages confirmed by the owner 2026-11-07). Runs once on an empty DB. */
export function seedIfEmpty(db: Db) {
	if (db.select({ id: categories.id }).from(categories).limit(1).all().length) return;
	db.transaction((tx) => {
		const [dev] = tx.insert(categories).values({ name: 'Развитие', color: 'blue' }).returning().all();
		const [health] = tx.insert(categories).values({ name: 'Здоровье', color: 'green' }).returning().all();
		const items = [
			{ cat: dev.id, title: 'Итальянский', unit: 'мин', minDose: 5, normDose: 15 },
			{ cat: dev.id, title: 'Английский вслух', unit: 'мин', minDose: 5, normDose: 10 },
			{ cat: dev.id, title: 'HBR', unit: 'стр', minDose: 1, normDose: 3 },
			{ cat: health.id, title: 'Спорт', unit: 'трен', minDose: 1, normDose: 1 }
		];
		items.forEach((it, i) => {
			const [g] = tx.insert(goals).values({ title: it.title, categoryId: it.cat }).returning().all();
			tx.insert(practices)
				.values({ goalId: g.id, title: it.title, unit: it.unit, minDose: it.minDose, normDose: it.normDose, sortOrder: i })
				.run();
		});
	});
}
