import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { isNoteDoc, isEmptyNote, NOTE_MAX, type NoteDoc } from '../note.js';
import type { Db } from './db.js';
import { practices } from './schema.js';
import { InputError } from './settings.js';

/**
 * Saves a practice's note. The later change wins (by the client's change time), so an old
 * offline edit replayed after a newer one from another device does not overwrite it.
 * Returns false when a newer note is already stored.
 */
export function setNote(db: Db, practiceId: number, note: unknown, updatedAt: string): boolean {
	if (note !== null && !isNoteDoc(note)) throw new InputError('Заметка в неверном формате');
	const empty = note === null || (isEmptyNote(note as NoteDoc) && !hasChecklist(note as NoteDoc));
	const json = empty ? null : JSON.stringify(note);
	if (json && json.length > NOTE_MAX) throw new InputError('Заметка слишком длинная');
	if (Number.isNaN(Date.parse(updatedAt))) throw new InputError('Неверное время изменения');
	if (!db.select({ id: practices.id }).from(practices).where(eq(practices.id, practiceId)).get())
		throw new InputError('Практика не найдена');
	const r = db
		.update(practices)
		.set({ note: json, noteUpdatedAt: updatedAt })
		.where(
			and(
				eq(practices.id, practiceId),
				or(isNull(practices.noteUpdatedAt), lt(practices.noteUpdatedAt, updatedAt))
			)
		)
		.run();
	return r.changes > 0;
}

function hasChecklist(doc: NoteDoc): boolean {
	return JSON.stringify(doc).includes('"taskItem"');
}
