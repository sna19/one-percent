import { createStore, get, set, del, entries as idbEntries } from 'idb-keyval';
import type { WeekData } from './types.js';
import type { NoteDoc } from './note.js';

/**
 * Offline layer. Weeks are cached as last seen; marks go to a queue keyed by practice+date,
 * so only the latest amount per cell is kept and replaying is safe (the server upserts).
 */
const weeks = createStore('one-percent', 'weeks');
const queue = createStore('one-percent-queue', 'marks');
/** Spec 005: note edits wait here too, one per practice; the server keeps the later change. */
const notesQueue = createStore('one-percent-notes', 'notes');

export interface NoteEdit {
	practiceId: number;
	note: NoteDoc | null;
	/** client time of the change */
	updatedAt: string;
}

export const enqueueNote = (n: NoteEdit) => set(n.practiceId, n, notesQueue);

/** Spec 006: day notes, one per planned day. */
const dayNotesQueue = createStore('one-percent-day-notes', 'notes');
export interface DayNoteEdit extends NoteEdit {
	date: string;
}
export const enqueueDayNote = (n: DayNoteEdit) => set(`${n.practiceId}|${n.date}`, n, dayNotesQueue);
export const pendingDayNotes = async (): Promise<DayNoteEdit[]> =>
	(await idbEntries<string, DayNoteEdit>(dayNotesQueue).catch(() => [])).map(([, n]) => n);
export const pendingNotes = async (): Promise<NoteEdit[]> =>
	(await idbEntries<number, NoteEdit>(notesQueue).catch(() => [])).map(([, n]) => n);

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
			for (const n of await pendingNotes()) {
				const r = await fetch('/api/note', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(n)
				}).catch(() => undefined);
				if (!r) break;
				if (r.ok || r.status === 400) {
					const cur = await get<NoteEdit>(n.practiceId, notesQueue);
					if (cur && cur.updatedAt === n.updatedAt) await del(n.practiceId, notesQueue);
				} else break;
			}
			for (const n of await pendingDayNotes()) {
				const k = `${n.practiceId}|${n.date}`;
				const r = await fetch('/api/day-note', {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(n)
				}).catch(() => undefined);
				if (!r) break;
				if (r.ok || r.status === 400) {
					const cur = await get<DayNoteEdit>(k, dayNotesQueue);
					if (cur && cur.updatedAt === n.updatedAt) await del(k, dayNotesQueue);
				} else break;
			}
		} finally {
			flushing = undefined;
		}
		return (await pending()).length + (await pendingNotes()).length + (await pendingDayNotes()).length;
	})();
	return flushing;
}
