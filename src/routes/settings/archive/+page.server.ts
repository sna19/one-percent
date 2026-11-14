import { getDb } from '#lib/server/db.js';
import { loadSettings } from '#lib/server/settings.js';

export function load() {
	return loadSettings(getDb());
}
