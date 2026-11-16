import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { linkGroups, setInLinks, setLinksOrder } from '#lib/server/links.js';
import { InputError } from '#lib/server/settings.js';

/** #27 — GET the tab; POST { action: 'set', practiceId, on } | { action: 'order', ids }. */
export function GET() {
	return json(linkGroups(getDb()));
}

export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || typeof b.action !== 'string') error(400, 'expected { action, … }');
	try {
		if (b.action === 'set' && Number.isInteger(b.practiceId)) setInLinks(getDb(), b.practiceId, b.on === true);
		else if (b.action === 'order') setLinksOrder(getDb(), b.ids);
		else error(400, 'unknown action');
		return json({ ok: true });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}
