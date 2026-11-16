import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { createStep, deleteStep, goalSteps, orderSteps, setStepDone, updateStep } from '#lib/server/steps.js';
import { InputError } from '#lib/server/settings.js';

/** #28 — GET ?goalId= ; POST { action: create | update | done | undone | delete | order, … }. */
export function GET({ url }) {
	const goalId = Number(url.searchParams.get('goalId'));
	if (!Number.isInteger(goalId)) error(400, 'goalId expected');
	return json(goalSteps(getDb(), goalId));
}

const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : error(400, 'expected integer id'));

export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || typeof b.action !== 'string') error(400, 'expected { action, … }');
	const db = getDb();
	try {
		switch (b.action) {
			case 'create':
				return json({ ok: true, id: createStep(db, b) });
			case 'update':
				updateStep(db, int(b.id), b.fields ?? {});
				break;
			case 'done':
			case 'undone':
				setStepDone(db, int(b.id), b.action === 'done');
				break;
			case 'delete':
				deleteStep(db, int(b.id));
				break;
			case 'order':
				orderSteps(db, b.ids);
				break;
			default:
				error(400, 'unknown action');
		}
		return json({ ok: true });
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
}
