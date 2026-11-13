import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { setNote } from '#lib/server/note.js';
import { InputError } from '#lib/server/settings.js';

/** Idempotent: { practiceId, note: Tiptap JSON | null, updatedAt: ISO time of the change }. */
export async function PUT({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || !Number.isInteger(b.practiceId) || typeof b.updatedAt !== 'string') error(400, 'expected { practiceId, note, updatedAt }');
	try {
		const saved = setNote(getDb(), b.practiceId, b.note ?? null, b.updatedAt);
		return json({ ok: true, saved });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}
