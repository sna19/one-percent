import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { setEntry } from '#lib/server/entries.js';
import { isDateStr } from '#lib/dates.js';

/** Idempotent: sets the amount for (practiceId, date). amount 0 clears the day. */
export async function PUT({ request }) {
	const b = await request.json().catch(() => null);
	const ok =
		b &&
		Number.isInteger(b.practiceId) &&
		isDateStr(b.date) &&
		typeof b.amount === 'number' &&
		Number.isFinite(b.amount) &&
		b.amount >= 0 &&
		b.amount <= 100_000;
	if (!ok) error(400, 'expected { practiceId, date, amount ≥ 0 }');
	try {
		setEntry(getDb(), b.practiceId, b.date, b.amount);
	} catch (e) {
		if (String(e).includes('FOREIGN KEY')) error(404, 'unknown practice');
		throw e;
	}
	return json({ ok: true });
}
