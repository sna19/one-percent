// Consistent copy of the SQLite data file, safe while the app is running.
// Usage: node scripts/backup.mjs [target-dir]   (default: $DATA_DIR/backups)
// Keeps the newest $BACKUP_KEEP files (default 30).
import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dataDir = resolve(process.env.DATA_DIR ?? 'data');
const target = resolve(process.argv[2] ?? join(dataDir, 'backups'));
const keep = Number(process.env.BACKUP_KEEP ?? 30);

mkdirSync(target, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(target, `one-percent-${stamp}.db`);

const db = new Database(join(dataDir, 'one-percent.db'), { readonly: true, fileMustExist: true });
db.prepare('VACUUM INTO ?').run(file);
db.close();

const old = readdirSync(target)
	.filter((f) => /^one-percent-.*\.db$/.test(f))
	.sort()
	.slice(0, -keep);
for (const f of old) rmSync(join(target, f));

console.log(`backup: ${file}`);
