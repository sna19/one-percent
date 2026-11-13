import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { InputError, setPracticeOrder } from '#lib/server/settings.js';

/** «Порядок» on Today: { ids: practice ids in the new order }. The same order as in settings. */
export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	try {
		setPracticeOrder(getDb(), b?.ids);
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
	return json({ ok: true });
}
