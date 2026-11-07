/** Calendar dates as 'YYYY-MM-DD' strings in the owner's local time. */
export type DateStr = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): DateStr {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): DateStr {
	return toDateStr(new Date());
}

function utc(s: DateStr): number {
	const [y, m, d] = s.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
}

export function addDays(s: DateStr, n: number): DateStr {
	const d = new Date(utc(s) + n * 86_400_000);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole days from a to b (b - a). */
export function diffDays(a: DateStr, b: DateStr): number {
	return Math.round((utc(b) - utc(a)) / 86_400_000);
}

export function isDateStr(s: unknown): s is DateStr {
	return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
}

/** Weeks run Sunday to Saturday. */
export function weekStart(s: DateStr): DateStr {
	return addDays(s, -new Date(utc(s)).getUTCDay());
}

export function weekDays(start: DateStr): DateStr[] {
	return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
