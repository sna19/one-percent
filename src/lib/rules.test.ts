import { describe, expect, it } from 'vitest';
import { daysWithout, depth, priority } from './rules.js';
import { addDays, weekStart } from './dates.js';

const hbr = { minDose: 1, normDose: 3 };

describe('depth', () => {
	it('follows the spec table', () => {
		expect(depth(undefined, hbr)).toBe(0);
		expect(depth(0, hbr)).toBe(0);
		expect(depth(0.5, hbr)).toBe(0);
		expect(depth(1, hbr)).toBe(0.5);
		expect(depth(2, hbr)).toBe(0.5);
		expect(depth(3, hbr)).toBe(1);
		expect(depth(4, hbr)).toBe(1.5);
	});
	it('min equal to norm gives full depth', () => {
		expect(depth(1, { minDose: 1, normDose: 1 })).toBe(1);
	});
});

describe('daysWithout', () => {
	const today = '2026-11-07';
	it('is 0 when done today or yesterday', () => {
		expect(daysWithout(today, '2026-01-01', today)).toBe(0);
		expect(daysWithout('2026-11-06', '2026-01-01', today)).toBe(0);
	});
	it('does not count today until it is over', () => {
		expect(daysWithout('2026-11-05', '2026-01-01', today)).toBe(1);
		expect(daysWithout('2026-11-04', '2026-01-01', today)).toBe(2);
	});
	it('counts from creation when never done', () => {
		expect(daysWithout(null, today, today)).toBe(0);
		expect(daysWithout(null, '2026-11-04', today)).toBe(3);
	});
});

describe('priority', () => {
	it('picks largest N among not done today, first on ties', () => {
		const rows = [
			{ id: 1, n: 3, doneToday: true },
			{ id: 2, n: 2, doneToday: false },
			{ id: 3, n: 2, doneToday: false },
			{ id: 4, n: 0, doneToday: false }
		];
		expect(priority(rows)?.id).toBe(2);
		expect(priority(rows.map((r) => ({ ...r, doneToday: true })))).toBeUndefined();
	});
});

describe('dates', () => {
	it('week starts on Sunday', () => {
		expect(weekStart('2026-11-07')).toBe('2026-11-01'); // Saturday → Sunday
		expect(weekStart('2026-11-01')).toBe('2026-11-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	});
});
