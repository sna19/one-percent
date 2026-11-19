import { describe, expect, it } from 'vitest';
import { group, idleLabel, search, sortGoals } from './goalFinder.js';
import type { GalleryGoal } from './server/goals.js';

const T = '2026-11-19';
let n = 0;
function goal(o: Partial<GalleryGoal>): GalleryGoal {
	n++;
	return {
		id: n,
		title: `Цель ${n}`,
		imageKind: 'text',
		imageValue: '',
		color: 'slate',
		why: '',
		milestone: null,
		week: [],
		paused: false,
		invested: { kind: 'days', value: 0 },
		achieved: 0,
		categoryId: 1,
		focus: false,
		inWeek: false,
		rotation: false,
		volume: null,
		kind: 'growth',
		practices: [],
		deeds: [],
		lastTouch: null,
		createdAt: '2026-01-10T10:00:00Z',
		...o
	};
}

const eng = goal({ title: 'Английский', focus: true, lastTouch: '2026-11-18', practices: [{ id: 1, title: 'Duolingo', formatId: 1, format: 'Приложение' }] });
const run = goal({ title: 'Бег', inWeek: true, lastTouch: '2026-11-01', practices: [{ id: 2, title: 'Пробежка', formatId: null, format: null }] });
const piano = goal({ title: 'Пианино', rotation: true, lastTouch: '2026-08-01', categoryId: 2, why: 'играть Баха', createdAt: '2025-03-01T00:00:00Z' });
const home = goal({ title: 'Дом', kind: 'area', deeds: [{ id: 9, goalId: 0, goalTitle: 'Дом', goalKind: 'area', practiceId: null, title: 'Починить кран', plannedDate: null, dueDate: null, note: null, sortOrder: 0, createdAt: '', doneAt: null }] });
const fresh = goal({ title: 'Ёлка', createdAt: '2026-11-10T00:00:00Z' });
const all = [eng, run, piano, home, fresh];
const cats = [
	{ id: 1, name: 'Ум', color: 'blue' },
	{ id: 2, name: 'Музыка', color: 'green' }
];

describe('the goals finder', () => {
	it('searches titles, «why», practices and deeds; ё = е; all words must be found', () => {
		expect(search(all, 'англ').map((h) => h.goal.title)).toEqual(['Английский']);
		expect(search(all, 'duo')[0]).toMatchObject({ via: ['практика «Duolingo»'], practiceIds: [1] });
		expect(search(all, 'кран')[0].goal.title).toBe('Дом');
		expect(search(all, 'баха').map((h) => h.goal.title)).toEqual(['Пианино']);
		expect(search(all, 'елка').map((h) => h.goal.title)).toEqual(['Ёлка']);
		expect(search(all, 'бег баха')).toEqual([]);
		expect(search(all, '  ')).toEqual([]);
	});

	it('plan: ★ focus, this week, the rest, paused, spheres', () => {
		const g = group('plan', all, [], cats, [], T);
		expect(g.map((x) => [x.key, x.goals.map((y) => y.title)])).toEqual([
			['focus', ['Английский']],
			['week', ['Бег']],
			['rest', ['Ёлка']],
			['paused', ['Пианино']],
			['areas', ['Дом']]
		]);
	});

	it('movement: by days since the last touch', () => {
		const g = Object.fromEntries(group('movement', all, [], cats, [], T).map((x) => [x.key, x.goals.map((y) => y.title)]));
		expect(g).toEqual({ live: ['Английский'], fading: ['Бег'], asleep: ['Пианино'], new: ['Ёлка'], areas: ['Дом'] });
		expect(idleLabel(run, T)).toBe('18 дн назад');
		expect(idleLabel(fresh, T)).toBe('не начата');
	});

	it('formats: a goal under each format of its practices; categories; age', () => {
		const f = group('format', all, [], cats, [{ id: 1, name: 'Приложение' }], T);
		expect(f.map((x) => x.key)).toEqual(['f1', 'f-none', 'f-empty']);
		expect(group('category', all, [], cats, [], T).map((x) => x.goals.length)).toEqual([4, 1]);
		expect(group('age', all, [], cats, [], T).map((x) => x.key)).toEqual(['new', 'year', 'old']);
	});

	it('sorting: the longest untouched first', () => {
		expect(sortGoals([eng, run, piano, fresh], 'fresh', T).map((x) => x.title)).toEqual(['Ёлка', 'Пианино', 'Бег', 'Английский']);
		expect(sortGoals([run, eng], 'name', T).map((x) => x.title)).toEqual(['Английский', 'Бег']);
	});
});
