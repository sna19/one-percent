import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { computeReview, markViewed, saveRetro, setFocus } from '#lib/server/review.js';
import { InputError } from '#lib/server/settings.js';
import { addDays, isDateStr, weekStart } from '#lib/dates.js';

/** Spec 010 — GET ?today=&start= (default: last week); opening it marks the review as seen. */
export function GET({ url }) {
	const today = url.searchParams.get('today');
	if (!isDateStr(today)) error(400, 'today must be YYYY-MM-DD');
	const s = url.searchParams.get('start');
	const start = isDateStr(s) ? weekStart(s) : addDays(weekStart(today), -7);
	const db = getDb();
	try {
		const r = computeReview(db, start, today);
		if (url.searchParams.get('seen') !== '0') markViewed(db, start);
		return json(r);
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}

/** { action: 'retro', start, retroText?, retroResult? } | { action: 'focus', start, goalIds } */
export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || !isDateStr(b.start)) error(400, 'expected { action, start, … }');
	try {
		if (b.action === 'retro') saveRetro(getDb(), weekStart(b.start), b);
		else if (b.action === 'focus') setFocus(getDb(), weekStart(b.start), b.goalIds, isDateStr(b.today) ? b.today : undefined);
		else error(400, 'unknown action');
		return json({ ok: true });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}
