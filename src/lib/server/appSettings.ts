import { eq } from 'drizzle-orm';
import { merge, num, parseValue, SETTING, type Values } from '../registry.js';
import type { Db } from './db.js';
import { appSettings } from './schema.js';
import { InputError } from './settings.js';

/** #29 — the registry's values on the server: stored ones over the defaults. */
export function readSettings(db: Db): Values {
	const rows = db.select().from(appSettings).all();
	return merge(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

export const setting = (db: Db, key: string) => num(readSettings(db), key);

/** Sets a value (validated against its range) or, with `reset`, goes back to the default. */
export function writeSetting(db: Db, key: string, value: unknown, reset = false) {
	const s = SETTING[key];
	if (!s || s.type === 'info') throw new InputError('Этот параметр не меняется');
	if (reset) {
		db.delete(appSettings).where(eq(appSettings.key, key)).run();
		return readSettings(db);
	}
	const raw = value === null || value === undefined ? '' : String(value);
	const v = parseValue(s, raw);
	if (v === undefined)
		throw new InputError(s.type === 'int' ? `${s.title}: от ${s.min} до ${s.max}` : `${s.title}: один из вариантов`);
	if (v === null) db.delete(appSettings).where(eq(appSettings.key, key)).run();
	else
		db.insert(appSettings)
			.values({ key, value: String(v) })
			.onConflictDoUpdate({ target: appSettings.key, set: { value: String(v) } })
			.run();
	return readSettings(db);
}
