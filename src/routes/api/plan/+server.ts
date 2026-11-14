import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import {
	applySource,
	confirmPlan,
	copyDayNoteToWeek,
	ensureCurrentPlan,
	getPlan,
	getPlanLimit,
	listTemplates,
	pastWeeks,
	setPlanItem,
	setPlanRow,
	type PlanSource
} from '#lib/server/plan.js';
import { InputError } from '#lib/server/settings.js';
import { isDateStr, weekStart } from '#lib/dates.js';
import { loadWeek } from '#lib/server/week.js';

function dates(start: unknown, today: unknown) {
	if (!isDateStr(start) || !isDateStr(today)) error(400, 'start and today must be YYYY-MM-DD');
	return { start: weekStart(start), today };
}

/** Everything the planner needs for one week. */
function plannerData(start: string, today: string) {
	const db = getDb();
	const week = loadWeek(db, start, today);
	return {
		start,
		practices: week.practices,
		plan: week.plan ?? getPlan(db, start),
		templates: listTemplates(db).filter((t) => !t.archivedAt),
		pastWeeks: pastWeeks(db, start),
		limit: getPlanLimit(db)
	};
}

export function GET({ url }) {
	const { start, today } = dates(url.searchParams.get('start'), url.searchParams.get('today'));
	ensureCurrentPlan(getDb(), start, today);
	return json(plannerData(start, today));
}

/** JSON actions: source | item | row | confirm. Answers with fresh planner data. */
export async function POST({ request }) {
	const b = await request.json().catch(() => null);
	if (!b || typeof b !== 'object') error(400, 'expected JSON');
	const { start, today } = dates(b.start, b.today);
	const db = getDb();
	try {
		switch (b.action) {
			case 'source':
				applySource(db, start, today, String(b.source) as PlanSource);
				break;
			case 'item':
				if (!Number.isInteger(b.practiceId) || typeof b.planned !== 'boolean') error(400, 'bad item');
				setPlanItem(db, start, today, b.practiceId, String(b.date), b.planned);
				break;
			case 'row':
				if (!Number.isInteger(b.practiceId) || !['daily', 'default', 'clear'].includes(b.mode)) error(400, 'bad row');
				setPlanRow(db, start, today, b.practiceId, b.mode);
				break;
			case 'copyNote':
				if (!Number.isInteger(b.practiceId)) error(400, 'bad copy');
				copyDayNoteToWeek(db, b.practiceId, String(b.date), today);
				break;
			case 'confirm':
				confirmPlan(
					db,
					start,
					typeof b.templateName === 'string' ? b.templateName : undefined,
					Number.isInteger(b.replaceTemplateId) ? b.replaceTemplateId : undefined
				);
				break;
			default:
				error(400, 'unknown action');
		}
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
	return json(plannerData(start, today));
}
