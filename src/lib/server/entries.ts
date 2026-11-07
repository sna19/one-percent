import { sql } from 'drizzle-orm';
import type { Db } from './db.js';
import { entries } from './schema.js';

/**
 * Records the amount for a practice on a date. One entry per practice per day:
 * a repeated mark (e.g. replayed from the offline queue) updates it, never duplicates.
 */
export function setEntry(db: Db, practiceId: number, date: string, amount: number) {
	const now = new Date().toISOString();
	db.insert(entries)
		.values({ practiceId, date, amount, updatedAt: now })
		.onConflictDoUpdate({
			target: [entries.practiceId, entries.date],
			set: { amount: sql`excluded.amount`, updatedAt: now }
		})
		.run();
}
