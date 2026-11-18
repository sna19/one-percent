import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { readSettings, setting, writeSetting } from './appSettings.js';
import { getPlanLimit } from './plan.js';
import { focusOverLimit, setFocus } from './review.js';
import { InputError } from './settings.js';
import { defaults, merge, SETTINGS } from '../registry.js';

function setup() {
	const { db } = openDb(':memory:');
	seedIfEmpty(db);
	return db;
}

describe('the registry (#29)', () => {
	it('every setting has a group, a title, a «?» text and a default inside its range', () => {
		for (const s of SETTINGS) {
			expect(s.help.length, s.key).toBeGreaterThan(40);
			if (s.type === 'int' && !s.nullable) expect(s.default >= s.min && s.default <= s.max, s.key).toBe(true);
			if (s.type === 'choice') expect(s.options.some((o) => o.value === s.default), s.key).toBe(true);
		}
		expect(defaults()['goals.focus_max']).toBe(3);
		expect(defaults().plan_limit).toBeNull();
	});

	it('a stored value out of range falls back to the default', () => {
		expect(merge({ 'goals.focus_max': '9', 'today.flash': '1500', stale_days: 'x' })).toMatchObject({ 'goals.focus_max': 3, 'today.flash': '1500', stale_days: 14 });
	});

	it('writes within the range only, resets, and the soft plan limit is the same setting', () => {
		const db = setup();
		expect(() => writeSetting(db, 'goals.focus_max', 6)).toThrow(InputError);
		expect(() => writeSetting(db, 'week.start', 'monday')).toThrow(InputError);
		writeSetting(db, 'stale_days', 21);
		expect(setting(db, 'stale_days')).toBe(21);
		writeSetting(db, 'stale_days', null, true);
		expect(setting(db, 'stale_days')).toBe(14);
		writeSetting(db, 'plan_limit', 12);
		expect(getPlanLimit(db)).toBe(12);
		writeSetting(db, 'plan_limit', null);
		expect(getPlanLimit(db)).toBeNull();
		expect(readSettings(db)['today.flash']).toBe('2500');
	});

	it('the focus limit is enforced; lowering it below this week’s ★ lists them to choose from', () => {
		const db = setup();
		const W = '2026-11-15';
		setFocus(db, W, [1, 2, 3], '2026-11-16');
		writeSetting(db, 'goals.focus_max', 2);
		expect(() => setFocus(db, W, [1, 2, 3], '2026-11-16')).toThrow(/не больше 2/);
		const over = focusOverLimit(db, '2026-11-16')!;
		expect(over).toMatchObject({ start: W, max: 2 });
		expect(over.goals.map((g) => g.id)).toEqual([1, 2, 3]);
		setFocus(db, W, [1, 3], '2026-11-16');
		expect(focusOverLimit(db, '2026-11-16')).toBeNull();
	});
});
