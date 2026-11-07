import { json } from '@sveltejs/kit';
import { getSqlite } from '#lib/server/db.js';

/** Used by the deploy script and Docker HEALTHCHECK: 200 only if the data file is readable. */
export function GET() {
	try {
		getSqlite().prepare('select 1').get();
		return json({ ok: true });
	} catch (e) {
		return json({ ok: false, error: String(e) }, { status: 503 });
	}
}
