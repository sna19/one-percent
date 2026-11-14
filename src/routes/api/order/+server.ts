import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { InputError, setOrder } from '#lib/server/settings.js';

/** Drag order: { kind?: practice|goal|category|format|template, ids: in the new order }. */
export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	try {
		setOrder(getDb(), b?.kind ?? 'practice', b?.ids);
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
	return json({ ok: true });
}
