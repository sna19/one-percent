import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { endPractice, finishVolume, nextVolume, position, setPosition, setVolume } from '#lib/server/volume.js';
import { InputError } from '#lib/server/settings.js';
import { isDateStr } from '#lib/dates.js';

/** #24 — a practice's volume. GET ?practiceId=&today= → { position }; POST { action, practiceId, today, … }. */
export function GET({ url }) {
	const id = Number(url.searchParams.get('practiceId'));
	const today = url.searchParams.get('today');
	if (!Number.isInteger(id) || !isDateStr(today)) error(400, 'practiceId and today expected');
	try {
		return json({ position: position(getDb(), id, today) });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}

export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || !Number.isInteger(b.practiceId) || !isDateStr(b.today)) error(400, 'expected { action, practiceId, today, … }');
	const db = getDb();
	try {
		switch (b.action) {
			case 'set':
				setVolume(db, b.practiceId, b.total ?? null, b.at, b.today);
				break;
			case 'at':
				setPosition(db, b.practiceId, b.at, b.today);
				break;
			case 'finish':
				return json({ ok: true, done: finishVolume(db, b.practiceId, b.today) });
			case 'next':
				nextVolume(db, b.practiceId, b.total, b.title, b.today);
				break;
			case 'end':
				endPractice(db, b.practiceId);
				break;
			default:
				error(400, 'unknown action');
		}
		return json({ ok: true, position: b.action === 'end' ? null : position(db, b.practiceId, b.today) });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}
