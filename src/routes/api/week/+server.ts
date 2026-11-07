import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { loadWeek } from '#lib/server/week.js';
import { isDateStr, weekStart } from '#lib/dates.js';

/** ?start=YYYY-MM-DD (any day of the week) &today=YYYY-MM-DD (client's local date). */
export function GET({ url }) {
	const today = url.searchParams.get('today');
	const start = url.searchParams.get('start') ?? today;
	if (!isDateStr(today) || !isDateStr(start)) error(400, 'start and today must be YYYY-MM-DD');
	return json(loadWeek(getDb(), weekStart(start), today));
}
