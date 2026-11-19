import { addDays, type DateStr } from './dates.js';
import type { GalleryGoal } from './server/goals.js';

/**
 * #31 — the goals screen as a finder (owner's request 19.11.2026): find a goal among many, mark the important
 * ones (★ focus) to come back to them fast, and go through a goal to its practices and deeds. One list, a
 * search line on top and a grouping chosen by a chip.
 */

export type GroupBy = 'plan' | 'movement' | 'category' | 'format' | 'kind' | 'ready' | 'age';
export const GROUPINGS: { key: GroupBy; label: string }[] = [
	{ key: 'plan', label: '★ План' },
	{ key: 'movement', label: 'Движение' },
	{ key: 'category', label: 'Категории' },
	{ key: 'format', label: 'Форматы' },
	{ key: 'kind', label: 'Рост и сферы' },
	{ key: 'ready', label: 'Готовность' },
	{ key: 'age', label: 'Возраст' }
];

export type SortBy = 'own' | 'fresh' | 'name';
export const SORTS: { key: SortBy; label: string }[] = [
	{ key: 'own', label: 'Как расставлены' },
	{ key: 'fresh', label: 'Давно не касался — выше' },
	{ key: 'name', label: 'По имени' }
];

export interface Group {
	key: string;
	title: string;
	/** a pale group: paused, the path, «no movement» */
	pale?: boolean;
	/** a category's colour key */
	color?: string;
	goals: GalleryGoal[];
}

export interface Category {
	id: number;
	name: string;
	color: string;
}

/** days since the goal was last touched; null — never */
export function idleDays(x: GalleryGoal, today: DateStr): number | null {
	if (!x.lastTouch) return null;
	return Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(x.lastTouch + 'T12:00:00Z')) / 86_400_000);
}

export function idleLabel(x: GalleryGoal, today: DateStr): string {
	const d = idleDays(x, today);
	if (d === null) return 'не начата';
	if (d === 0) return 'сегодня';
	if (d === 1) return 'вчера';
	if (d < 30) return `${d} дн назад`;
	if (d < 365) return `${Math.round(d / 30)} мес назад`;
	return 'больше года';
}

const norm = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е');

export interface Hit {
	goal: GalleryGoal;
	/** what matched when it was not the goal's own title */
	via: string[];
	practiceIds: number[];
	deedIds: number[];
}

/** search by the goal's title, «why», milestone, its practices and open deeds; each word must be found */
export function search(goals: GalleryGoal[], query: string): Hit[] {
	const words = norm(query).split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const out: Hit[] = [];
	for (const g of goals) {
		const own = norm([g.title, g.why, g.milestone?.title ?? ''].join(' '));
		const ps = g.practices.filter((p) => words.some((w) => norm(p.title).includes(w)));
		const ds = g.deeds.filter((d) => words.some((w) => norm(d.title).includes(w)));
		const everything = [own, ...g.practices.map((p) => norm(p.title)), ...g.deeds.map((d) => norm(d.title))].join(' ');
		if (!words.every((w) => everything.includes(w))) continue;
		const titleHit = words.some((w) => norm(g.title).includes(w));
		out.push({
			goal: g,
			via: titleHit ? [] : [...ps.map((p) => `практика «${p.title}»`), ...ds.map((d) => `дело «${d.title}»`)].slice(0, 3),
			practiceIds: ps.map((p) => p.id),
			deedIds: ds.map((d) => d.id)
		});
	}
	// the goal's own title first, then the rest
	return out.sort((a, b) => Number(a.via.length > 0) - Number(b.via.length > 0));
}

export function sortGoals(list: GalleryGoal[], by: SortBy, today: DateStr): GalleryGoal[] {
	if (by === 'own') return list;
	if (by === 'name') return [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
	// longest untouched first, never touched at the very top
	return [...list].sort((a, b) => (idleDays(b, today) ?? 1e9) - (idleDays(a, today) ?? 1e9));
}

/**
 * The goals in groups. `goals` — the live goals of growth and the spheres; `path` — archived goals (only the
 * plan grouping shows them, pale, at the end).
 */
export function group(by: GroupBy, goals: GalleryGoal[], path: GalleryGoal[], categories: Category[], formats: { id: number; name: string }[], today: DateStr): Group[] {
	const growth = goals.filter((g) => g.kind !== 'area');
	const areas = goals.filter((g) => g.kind === 'area');
	const groups: Group[] = [];
	const put = (key: string, title: string, list: GalleryGoal[], extra: Partial<Group> = {}) => {
		if (list.length) groups.push({ key, title, goals: list, ...extra });
	};
	switch (by) {
		case 'plan':
			put('focus', '★ В фокусе', growth.filter((g) => g.focus));
			put('week', 'Эта неделя', growth.filter((g) => !g.focus && g.inWeek));
			put('rest', 'Остальные', growth.filter((g) => !g.focus && !g.inWeek && !g.rotation));
			put('paused', 'На паузе', growth.filter((g) => !g.focus && g.rotation), { pale: true });
			put('areas', 'Сферы', areas);
			put('path', 'Пройденный путь', path, { pale: true });
			break;
		case 'movement': {
			const d = (g: GalleryGoal) => idleDays(g, today);
			put('live', 'Живые — за последнюю неделю', growth.filter((g) => d(g) !== null && d(g)! <= 7));
			put('fading', 'Затухают — 8–30 дней', growth.filter((g) => d(g) !== null && d(g)! > 7 && d(g)! <= 30));
			put('asleep', 'Спят — больше месяца', growth.filter((g) => d(g) !== null && d(g)! > 30));
			put('new', 'Не начаты', growth.filter((g) => d(g) === null), { pale: true });
			put('areas', 'Сферы', areas);
			break;
		}
		case 'category':
			for (const c of categories) put(`c${c.id}`, c.name, goals.filter((g) => g.categoryId === c.id), { color: c.color });
			put('c-none', 'Без категории', goals.filter((g) => !categories.some((c) => c.id === g.categoryId)), { pale: true });
			break;
		case 'format':
			// a goal stands under each format of its practices
			for (const f of formats) put(`f${f.id}`, f.name, goals.filter((g) => g.practices.some((p) => p.formatId === f.id)));
			put('f-none', 'Без формата', goals.filter((g) => g.practices.some((p) => p.formatId === null)), { pale: true });
			put('f-empty', 'Без практик', goals.filter((g) => !g.practices.length), { pale: true });
			break;
		case 'kind':
			put('growth', 'Цели роста', growth);
			put('areas', 'Сферы жизни', areas);
			break;
		case 'ready':
			put('dated', 'Майлстон со сроком', growth.filter((g) => g.milestone?.dueDate));
			put('undated', 'Майлстон без срока', growth.filter((g) => g.milestone && !g.milestone.dueDate));
			put('nomile', 'Без майлстона', growth.filter((g) => !g.milestone && g.why));
			put('bare', 'Без майлстона и без «зачем»', growth.filter((g) => !g.milestone && !g.why), { pale: true });
			break;
		case 'age': {
			const month = addDays(today, -30);
			const year = today.slice(0, 4);
			put('new', 'Новые — меньше месяца', goals.filter((g) => g.createdAt.slice(0, 10) >= month));
			put('year', `Этого года`, goals.filter((g) => g.createdAt.slice(0, 10) < month && g.createdAt.slice(0, 4) === year));
			put('old', 'Давние', goals.filter((g) => g.createdAt.slice(0, 4) < year));
			break;
		}
	}
	return groups;
}
