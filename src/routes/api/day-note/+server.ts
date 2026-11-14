import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { setPlanNote } from '#lib/server/plan.js';
import { InputError } from '#lib/server/settings.js';

/** Spec 006 — idempotent: { practiceId, date, note: Tiptap JSON | null, updatedAt }. */
export async function PUT({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || !Number.isInteger(b.practiceId) || typeof b.date !== 'string' || typeof b.updatedAt !== 'string')
		error(400, 'expected { practiceId, date, note, updatedAt }');
	try {
		return json({ ok: true, saved: setPlanNote(getDb(), b.practiceId, b.date, b.note ?? null, b.updatedAt, typeof b.today === 'string' ? b.today : undefined) });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}
