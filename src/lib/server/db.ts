import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as schema from './schema.js';
import { seedIfEmpty } from './seed.js';

/** Directory with the single data file. In Docker it is the `/data` volume. */
export const dataDir = resolve(process.env.DATA_DIR ?? 'data');
export const dbPath = join(dataDir, 'one-percent.db');
const migrationsDir = resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');

export type Db = BetterSQLite3Database<typeof schema>;

/** Opens a database file (or ':memory:') and applies pending migrations. */
export function openDb(path: string, migrationsFolder = migrationsDir): { sqlite: Database.Database; db: Db } {
	const sqlite = new Database(path);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	const db = drizzle(sqlite, { schema });
	const journal = join(migrationsFolder, 'meta', '_journal.json');
	if (!existsSync(journal)) {
		throw new Error(`migrations not found in ${migrationsFolder} (cwd ${process.cwd()}); set MIGRATIONS_DIR`);
	}
	if (path !== ':memory:') backupBeforeMigrations(sqlite, journal, path);
	migrate(db, { migrationsFolder });
	return { sqlite, db };
}

/** User data is the value: copy the file before a schema change touches it. */
function backupBeforeMigrations(sqlite: Database.Database, journal: string, path: string) {
	const total = JSON.parse(readFileSync(journal, 'utf8')).entries.length as number;
	const hasTable = sqlite
		.prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
		.get();
	if (!hasTable) return; // a new, empty database
	const { n } = sqlite.prepare('select count(*) as n from __drizzle_migrations').get() as { n: number };
	if (n >= total) return;
	const dir = join(dirname(path), 'backups');
	mkdirSync(dir, { recursive: true });
	const file = join(dir, `pre-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
	sqlite.prepare('VACUUM INTO ?').run(file);
	console.log(`backup before ${total - n} migration(s): ${file}`);
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
