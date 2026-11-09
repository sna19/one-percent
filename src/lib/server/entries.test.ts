import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { categories, entries, formats, goals, practices } from './schema.js';
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

describe('migrations', async () => {
	const fs = await import('node:fs');
	const os = await import('node:os');
	const path = await import('node:path');
	const { default: Database } = await import('better-sqlite3');

	it('upgrades a v0.1 database: backup first, entries kept, formats seeded', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-'));
		const file = path.join(dir, 'one-percent.db');
		// a v0.1 database = only the first migration
		const v01 = path.join(dir, 'migrations-v01');
		fs.cpSync('drizzle', v01, { recursive: true });
		const journal = path.join(v01, 'meta', '_journal.json');
		const j = JSON.parse(fs.readFileSync(journal, 'utf8'));
		j.entries = j.entries.slice(0, 1);
		fs.writeFileSync(journal, JSON.stringify(j));
		const { sqlite } = openDb(file, v01);
		sqlite.exec("insert into categories (name, color) values ('C', 'blue')");
		sqlite.exec("insert into goals (title, category_id) values ('G', 1)");
		sqlite.exec("insert into practices (goal_id, title, unit, min_dose, norm_dose) values (1, 'P', 'мин', 1, 2)");
		sqlite.exec("insert into entries (practice_id, date, amount, updated_at) values (1, '2026-11-07', 2, 'x')");
		sqlite.close();

		const { db, sqlite: s2 } = openDb(file);
		expect(db.select().from(formats).all().map((f) => f.name)).toEqual(['Практика языка', 'Аудиокниги', 'Чтение', 'Спорт']);
		expect(db.select().from(entries).all()).toHaveLength(1);
		const backups = fs.readdirSync(path.join(dir, 'backups'));
		expect(backups).toHaveLength(1);
		const old = new Database(path.join(dir, 'backups', backups[0]), { readonly: true });
		expect(old.prepare('select count(*) as n from entries').get()).toEqual({ n: 1 });
		old.close();
		s2.close();
		// nothing pending: no new backup
		openDb(file).sqlite.close();
		expect(fs.readdirSync(path.join(dir, 'backups'))).toHaveLength(1);
	});
});
