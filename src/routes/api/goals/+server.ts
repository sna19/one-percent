import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { gallery } from '#lib/server/goals.js';
import { isDateStr } from '#lib/dates.js';

/** Spec 013 — the «Цели» gallery, counted with the device's today. */
export function GET({ url }) {
	const today = url.searchParams.get('today');
	if (!isDateStr(today)) error(400, 'today must be YYYY-MM-DD');
	return json(gallery(getDb(), today));
}
