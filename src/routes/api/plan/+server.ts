import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import {
	applySource,
	confirmPlan,
	copyDayNoteToWeek,
	ensureCurrentPlan,
	getPlan,
	getPlanLimit,
	movePlanItem,
	listTemplates,
	pastWeeks,
	setPlanItem,
	setPlanRow,
	setTemplateDay,
	mirrorToTemplate,
	weekTemplate,
	type PlanSource
} from '#lib/server/plan.js';
import { InputError } from '#lib/server/settings.js';
import { openCount } from '#lib/server/inbox.js';
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
		limit: getPlanLimit(db),
		/** «#19 + #22, уточнение»: the template this week was built from, for «И в шаблон» */
		template: weekTemplate(db, start),
		/** Spec 008: planning starts with the inbox */
		inboxOpen: openCount(db)
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
				if (b.template === true) {
					const tpl = weekTemplate(db, start);
					if (!tpl) throw new InputError('Неделя собрана не из шаблона');
					setTemplateDay(db, tpl.id, b.practiceId, new Date(`${b.date}T12:00:00Z`).getUTCDay(), b.planned);
				}
				break;
			case 'move':
				if (!Number.isInteger(b.practiceId)) error(400, 'bad move');
				movePlanItem(db, today, b.practiceId, String(b.date), String(b.to));
				break;
			case 'row':
				if (!Number.isInteger(b.practiceId) || !['daily', 'default', 'clear'].includes(b.mode)) error(400, 'bad row');
				setPlanRow(db, start, today, b.practiceId, b.mode);
				if (b.template === true) mirrorToTemplate(db, start, today, b.practiceId);
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
