import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { InputError, loadSettings, moveItem, saveFormat, savePlanLimit, savePractice, setArchived, setPracticeOrder } from './settings.js';
import { loadWeek } from './week.js';

const form = (o: Record<string, string | number>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, String(v));
	return f;
};

function setup() {
	const { db } = openDb(':memory:');
	seedIfEmpty(db);
	return db;
}

describe('settings', () => {
	it('adds a practice at the end and rejects min > norm', () => {
		const db = setup();
		savePractice(db, form({ title: 'Медитация', goalId: 1, unit: 'мин', minDose: 2, normDose: 10 }));
		expect(loadWeek(db, '2026-11-01', '2026-11-07').practices.at(-1)?.title).toBe('Медитация');
		expect(() => savePractice(db, form({ title: 'X', goalId: 1, unit: 'мин', minDose: 5, normDose: 2 }))).toThrow(
			InputError
		);
	});

	it('archived practice, goal or category leaves the main screen and comes back on restore', () => {
		const db = setup();
		const titles = () => loadWeek(db, '2026-11-01', '2026-11-07').practices.map((p) => p.title);
		setArchived(db, form({ kind: 'practice', id: 3 }), true);
		expect(titles()).not.toContain('HBR');
		setArchived(db, form({ kind: 'practice', id: 3 }), false);
		expect(titles()).toContain('HBR');
		setArchived(db, form({ kind: 'category', id: 2 }), true);
		expect(titles()).not.toContain('Спорт');
	});

	it('moves a practice up and down', () => {
		const db = setup();
		const order = () => loadSettings(db).practices.map((p) => p.id);
		moveItem(db, form({ id: 3, dir: -1 }));
		expect(order()).toEqual([1, 3, 2, 4]);
		moveItem(db, form({ id: 1, dir: -1 }));
		expect(order()).toEqual([1, 3, 2, 4]);
		moveItem(db, form({ id: 1, dir: 1 }));
		expect(order()).toEqual([3, 1, 2, 4]);
	});
});

describe('formats', () => {
	it('practice gets a format; archived format reads as none', () => {
		const db = setup();
		savePractice(db, form({ id: 3, title: 'HBR', goalId: 3, formatId: 3, unit: 'стр', minDose: 1, normDose: 3 }));
		const hbr = () => loadWeek(db, '2026-11-01', '2026-11-07').practices.find((p) => p.id === 3)!;
		expect(hbr().formatName).toBe('Чтение');
		setArchived(db, form({ kind: 'format', id: 3 }), true);
		expect(hbr().formatId).toBeNull();
		savePractice(db, form({ id: 3, title: 'HBR', goalId: 3, formatId: '', unit: 'стр', minDose: 1, normDose: 3 }));
		setArchived(db, form({ kind: 'format', id: 3 }), false);
		expect(hbr().formatId).toBeNull();
	});

	it('creates, renames and reorders formats', () => {
		const db = setup();
		saveFormat(db, form({ name: 'Подкасты' }));
		saveFormat(db, form({ id: 1, name: 'Разговор' }));
		const names = () => loadSettings(db).formats.map((f) => f.name);
		expect(names()).toEqual(['Разговор', 'Аудиокниги', 'Чтение', 'Спорт', 'Подкасты']);
		moveItem(db, form({ kind: 'format', id: 5, dir: -1 }));
		expect(names()).toEqual(['Разговор', 'Аудиокниги', 'Чтение', 'Подкасты', 'Спорт']);
	});

	it('moving skips archived neighbours', () => {
		const db = setup();
		setArchived(db, form({ kind: 'practice', id: 2 }), true);
		moveItem(db, form({ id: 3, dir: -1 }));
		expect(loadSettings(db).practices.filter((p) => !p.archivedAt).map((p) => p.id)).toEqual([3, 1, 4]);
	});
});

describe('planning settings', () => {
	it('usual days and plan limit', () => {
		const db = setup();
		const f = form({ id: 4, title: 'Спорт', goalId: 4, unit: 'трен', minDose: 1, normDose: 1 });
		f.append('defaultDays', '6');
		f.append('defaultDays', '1');
		f.append('defaultDays', '5');
		savePractice(db, f);
		expect(loadSettings(db).practices.find((p) => p.id === 4)!.defaultDays).toBe('1,5,6');
		savePlanLimit(db, form({ limit: '8' }));
		expect(loadSettings(db).planLimit).toBe(8);
		savePlanLimit(db, form({ limit: '' }));
		expect(loadSettings(db).planLimit).toBeNull();
		expect(() => savePlanLimit(db, form({ limit: '-1' }))).toThrow(InputError);
	});
});

describe('day plan flags', () => {
	it('two practice toggles, off unless checked', () => {
		const db = setup();
		const f = form({ id: 3, title: 'HBR', goalId: 3, unit: 'стр', minDose: 1, normDose: 3, showNoteFull: 'on' });
		savePractice(db, f);
		const p = loadSettings(db).practices.find((x) => x.id === 3)!;
		expect([p.showNoteFull, p.checklistMarks]).toEqual([true, false]);
	});
});

describe('setPracticeOrder', () => {
	it('puts given ids first, keeps the rest after, ignores unknown ids', () => {
		const db = setup();
		setArchived(db, form({ kind: 'practice', id: 2 }), true);
		setPracticeOrder(db, [4, 1, 99, 3]);
		expect(loadSettings(db).practices.map((p) => p.id)).toEqual([4, 1, 3, 2]);
		expect(() => setPracticeOrder(db, ['x' as unknown as number])).toThrow(InputError);
	});
});
