import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { readSettings, writeSetting } from '#lib/server/appSettings.js';
import { InputError } from '#lib/server/settings.js';
import { focusOverLimit } from '#lib/server/review.js';

/** #29 — GET: the registry's values; POST { key, value } or { key, reset: true }. */
export function GET() {
	return json({ values: readSettings(getDb()) });
}

export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || typeof b.key !== 'string') error(400, 'expected { key, value }');
	const db = getDb();
	try {
		const values = writeSetting(db, b.key, b.value, b.reset === true);
		// fewer focus goals than starred now: the screen asks which to take off
		const over = b.key === 'goals.focus_max' ? focusOverLimit(db, b.today) : null;
		return json({ values, focusOver: over });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}
