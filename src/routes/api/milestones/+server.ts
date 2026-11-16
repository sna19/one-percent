import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { closeMilestone, createMilestone, goalMilestones, reopenMilestone, snoozeMilestone, updateMilestone } from '#lib/server/milestones.js';
import { InputError } from '#lib/server/settings.js';
import { isDateStr } from '#lib/dates.js';

/** Spec 009 — a goal's milestones: GET ?goalId=&today= ; POST { action, today, … }. */
export function GET({ url }) {
	const goalId = Number(url.searchParams.get('goalId'));
	const today = url.searchParams.get('today');
	if (!Number.isInteger(goalId) || !isDateStr(today)) error(400, 'goalId and today expected');
	return json(goalMilestones(getDb(), goalId, today));
}

const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : error(400, 'expected integer ids'));

export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || typeof b.action !== 'string' || !isDateStr(b.today)) error(400, 'expected { action, today, … }');
	const db = getDb();
	try {
		switch (b.action) {
			case 'create':
				return json({ ok: true, id: createMilestone(db, int(b.goalId), b, b.today) });
			case 'update':
				updateMilestone(db, int(b.id), b, b.today);
				break;
			case 'close':
				if (!['achieved', 'missed', 'dropped'].includes(b.status)) error(400, 'bad status');
				closeMilestone(db, int(b.id), b.status, b.reviewNote);
				break;
			case 'reopen':
				reopenMilestone(db, int(b.id), b.dueDate);
				break;
			case 'snooze':
				snoozeMilestone(db, int(b.id), b.today);
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
