import type { DateStr } from './dates.js';
import { groupDaysWithout, groupPractices, type AmountOf, type IsPlanned } from './groups.js';
import { counts, priority } from './rules.js';
import type { PracticeView } from './types.js';

/** Spec 004 — the working screen of the day, built from the plan and the marks. */
export interface TodayLists {
	/** planned for today, not done yet */
	todo: PracticeView[];
	/** done today (≥ min), planned or bonus */
	done: { p: PracticeView; bonus: boolean }[];
	/** everything else that is active: tapping one is a bonus */
	other: PracticeView[];
	/** «по плану X из Y» for today, in practices */
	plannedDone: number;
	planned: number;
	/** goal to do first, among goals with unfinished plan today */
	top: string | undefined;
}

export function todayLists(
	practices: PracticeView[],
	today: DateStr,
	isPlanned: IsPlanned,
	amountOf: AmountOf
): TodayLists {
	const todo: PracticeView[] = [];
	const done: TodayLists['done'] = [];
	const other: PracticeView[] = [];
	let planned = 0;
	for (const p of practices) {
		const plan = isPlanned(p.id, today);
		const did = counts(amountOf(p.id, today), p);
		if (plan) planned++;
		if (did) done.push({ p, bonus: !plan });
		else if (plan) todo.push(p);
		else other.push(p);
	}
	const plannedDone = done.filter((d) => !d.bonus).length;
	const top = priority(
		groupPractices(todo, 'goal').map((g, i) => ({
			id: i,
			title: g.title,
			// the goal's whole history, not only today's unfinished practices
			n: groupDaysWithout(
				{ ...g, practices: practices.filter((p) => p.goalId === g.practices[0].goalId) },
				today
			),
			doneToday: false
		}))
	)?.title;
	return { todo, done, other, plannedDone, planned, top };
}

const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «Пн, 9 ноября» */
export function dayTitle(d: DateStr): string {
	const [y, m, day] = d.split('-').map(Number);
	return `${DAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]}, ${day} ${MONTHS[m - 1]}`;
}

/** «мин 5 · норма 15 мин» or «норма 1 трен» */
export function doseHint(p: Pick<PracticeView, 'minDose' | 'normDose' | 'unit'>): string {
	return p.minDose < p.normDose ? `мин ${p.minDose} · норма ${p.normDose} ${p.unit}` : `норма ${p.normDose} ${p.unit}`;
}
