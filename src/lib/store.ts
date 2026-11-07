import { createStore, get, set, del, entries as idbEntries } from 'idb-keyval';
import type { WeekData } from './types.js';

/**
 * Offline layer. Weeks are cached as last seen; marks go to a queue keyed by practice+date,
 * so only the latest amount per cell is kept and replaying is safe (the server upserts).
 */
const weeks = createStore('one-percent', 'weeks');
const queue = createStore('one-percent-queue', 'marks');

export interface Mark {
	practiceId: number;
	date: string;
	amount: number;
}

const key = (m: Pick<Mark, 'practiceId' | 'date'>) => `${m.practiceId}|${m.date}`;

export const cachedWeek = (start: string) => get<WeekData>(start, weeks).catch(() => undefined);
export const cacheWeek = (w: WeekData) => set(w.start, w, weeks).catch(() => {});

export const enqueue = (m: Mark) => set(key(m), m, queue);
export const pending = async (): Promise<Mark[]> =>
	(await idbEntries<string, Mark>(queue).catch(() => [])).map(([, m]) => m);

let flushing: Promise<number> | undefined;

/** Sends queued marks; returns how many are still pending. */
export function flush(): Promise<number> {
	flushing ??= (async () => {
		try {
			for (const m of await pending()) {
				const r = await fetch('/api/entries', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(m)
				}).catch(() => undefined);
				if (!r) break; // offline or Access login needed: keep the rest
				if (r.ok || r.status === 400 || r.status === 404) {
					// sent, or can never succeed — drop it unless a newer mark replaced it meanwhile
					const cur = await get<Mark>(key(m), queue);
					if (cur && cur.amount === m.amount) await del(key(m), queue);
				} else break;
			}
		} finally {
			flushing = undefined;
		}
		return (await pending()).length;
	})();
	return flushing;
}
