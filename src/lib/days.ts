/** Usual weekdays stored as '1,5,6' (0 Sun … 6 Sat). */
export function parseDays(s: string | null | undefined): number[] {
	if (!s) return [];
	return [...new Set(s.split(',').map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).sort();
}
