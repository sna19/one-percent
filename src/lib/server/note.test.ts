import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { practices } from './schema.js';
import { setNote } from './note.js';
import { InputError } from './settings.js';

const note = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });

function setup() {
	const { db } = openDb(':memory:');
	seedIfEmpty(db);
	return db;
}
const stored = (db: ReturnType<typeof setup>) => db.select().from(practices).where(eq(practices.id, 1)).get()!;

describe('setNote', () => {
	it('stores the note; the later change wins', () => {
		const db = setup();
		expect(setNote(db, 1, note('новое'), '2026-11-13T10:00:00.000Z')).toBe(true);
		expect(setNote(db, 1, note('старое офлайн'), '2026-11-13T09:00:00.000Z')).toBe(false);
		expect(JSON.parse(stored(db).note!).content[0].content[0].text).toBe('новое');
	});
	it('an empty note is stored as none', () => {
		const db = setup();
		setNote(db, 1, { type: 'doc', content: [{ type: 'paragraph' }] }, '2026-11-13T10:00:00.000Z');
		expect(stored(db).note).toBeNull();
	});
	it('rejects HTML, bad shapes and unknown practices', () => {
		const db = setup();
		expect(() => setNote(db, 1, '<script>', '2026-11-13T10:00:00.000Z')).toThrow(InputError);
		expect(() => setNote(db, 99, note('x'), '2026-11-13T10:00:00.000Z')).toThrow(InputError);
	});
});
