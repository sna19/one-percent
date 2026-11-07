import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Directory with the single data file. In Docker it is the `/data` volume. */
export const dataDir = resolve(process.env.DATA_DIR ?? 'data');
export const dbPath = join(dataDir, 'one-percent.db');

let db: Database.Database | undefined;

export function getDb(): Database.Database {
	if (!db) {
		mkdirSync(dataDir, { recursive: true });
		db = new Database(dbPath);
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		db.pragma('busy_timeout = 5000');
	}
	return db;
}
