import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as schema from './schema.js';
import { seedIfEmpty } from './seed.js';

/** Directory with the single data file. In Docker it is the `/data` volume. */
export const dataDir = resolve(process.env.DATA_DIR ?? 'data');
export const dbPath = join(dataDir, 'one-percent.db');
const migrationsDir = resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');

export type Db = BetterSQLite3Database<typeof schema>;

/** Opens a database file (or ':memory:') and applies pending migrations. */
export function openDb(path: string): { sqlite: Database.Database; db: Db } {
	const sqlite = new Database(path);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: migrationsDir });
	return { sqlite, db };
}

let opened: ReturnType<typeof openDb> | undefined;

function get() {
	if (!opened) {
		mkdirSync(dataDir, { recursive: true });
		opened = openDb(dbPath);
		seedIfEmpty(opened.db);
	}
	return opened;
}

export const getDb = (): Db => get().db;
export const getSqlite = (): Database.Database => get().sqlite;
