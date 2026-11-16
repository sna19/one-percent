import { error, json } from '@sveltejs/kit';
import { and, asc, gte, isNull, lte } from 'drizzle-orm';
import { getDb } from '#lib/server/db.js';
import {
	closeItem,
	createItem,
	dayChoices,
	editItem,
	listInbox,
	restoreItem,
	toDayNote,
	toNewGoal,
	toNewPractice,
	toPracticeNote,
	toStep
} from '#lib/server/inbox.js';
import { categories, goals, planItems } from '#lib/server/schema.js';
import { InputError } from '#lib/server/settings.js';
import { isDateStr } from '#lib/dates.js';

/** Spec 008 — the inbox list, «История», and what sorting needs: days, their plans, goals, categories. */
export function GET({ url }) {
	const today = url.searchParams.get('today');
	if (!isDateStr(today)) error(400, 'today must be YYYY-MM-DD');
	const db = getDb();
	const days = dayChoices(db, today);
	const planned: Record<string, number[]> = {};
	for (const r of db
		.select({ d: planItems.date, p: planItems.practiceId })
		.from(planItems)
		.where(and(gte(planItems.date, days[0]), lte(planItems.date, days[days.length - 1])))
		.all())
		(planned[r.d] ??= []).push(r.p);
	return json({
		...listInbox(db),
		days,
		planned,
		categories: db
			.select({ id: categories.id, name: categories.name, color: categories.color })
			.from(categories)
			.where(isNull(categories.archivedAt))
			.orderBy(asc(categories.sortOrder), asc(categories.id))
			.all(),
		goals: db
			.select({ id: goals.id, title: goals.title, categoryId: goals.categoryId })
			.from(goals)
			.where(isNull(goals.archivedAt))
			.orderBy(asc(goals.sortOrder), asc(goals.id))
			.all()
	});
}

const int = (v: unknown) => (Number.isInteger(v) ? (v as number) : error(400, 'expected integer ids'));

export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || typeof b.action !== 'string') error(400, 'expected { action, … }');
	const db = getDb();
	try {
		switch (b.action) {
			case 'create':
				return json(createItem(db, b));
			case 'edit':
				editItem(db, int(b.id), b.text);
				break;
			case 'done':
			case 'delete':
				closeItem(db, int(b.id), b.action === 'done' ? 'done' : 'deleted');
				break;
			case 'restore':
				restoreItem(db, int(b.id));
				break;
			case 'practiceNote':
				toPracticeNote(db, int(b.id), int(b.practiceId));
				break;
			case 'dayNote':
				if (!isDateStr(b.date) || !isDateStr(b.today)) error(400, 'date and today must be YYYY-MM-DD');
				toDayNote(db, int(b.id), int(b.practiceId), b.date, b.today, b.addToPlan === true);
				break;
			case 'newPractice':
				return json({ ok: true, practiceId: toNewPractice(db, int(b.id), int(b.goalId)) });
			case 'step':
				return json({ ok: true, stepId: toStep(db, int(b.id), int(b.goalId)) });
			case 'newGoal':
				return json({ ok: true, goalId: toNewGoal(db, int(b.id), int(b.categoryId)) });
			default:
				error(400, 'unknown action');
		}
		return json({ ok: true });
	} catch (e) {
		if (e instanceof InputError) error(e.message === 'not_planned' ? 409 : 400, e.message);
		throw e;
	}
}
