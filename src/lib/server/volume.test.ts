import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { setEntry } from './entries.js';
import { practices, volumesDone } from './schema.js';
import { endPractice, finishVolume, goalVolumesDone, nextVolume, position, setPosition, setVolume, volumes } from './volume.js';

const P = 3; // HBR, pages
describe('#24 practice volume', () => {
	it('position = start + marks since; «Я на стр. N»; finish once; next book; end', () => {
		const { db } = openDb(':memory:');
		seedIfEmpty(db);
		setEntry(db, P, '2026-11-10', 10); // before the volume: not counted
		setVolume(db, P, 320, 100, '2026-11-14');
		setEntry(db, P, '2026-11-14', 20);
		setEntry(db, P, '2026-11-16', 22);
		expect(position(db, P, '2026-11-16')).toBe(142);
		expect(volumes(db, '2026-11-16')[P]).toMatchObject({ total: 320, before: 120 });
		setPosition(db, P, 150, '2026-11-16');
		expect(position(db, P, '2026-11-16')).toBe(150);
		expect(finishVolume(db, P, '2026-11-16')).toBeNull();
		setEntry(db, P, '2026-11-17', 170);
		expect(finishVolume(db, P, '2026-11-17')).toEqual({ days: 4, total: 320 });
		expect(finishVolume(db, P, '2026-11-17')).toBeNull(); // once
		const g = db.select().from(practices).where(eq(practices.id, P)).get()!.goalId;
		expect(goalVolumesDone(db, g)).toHaveLength(1);
		nextVolume(db, P, 250, 'Новая книга', '2026-11-17');
		expect(position(db, P, '2026-11-17')).toBe(0);
		expect(db.select().from(practices).where(eq(practices.id, P)).get()).toMatchObject({ title: 'Новая книга', volumeTotal: 250, volumeDoneOn: null });
		setEntry(db, P, '2026-11-18', 12);
		expect(position(db, P, '2026-11-18')).toBe(12);
		setVolume(db, P, null, null, '2026-11-18');
		expect(volumes(db, '2026-11-18')[P]).toBeUndefined();
		endPractice(db, P);
		expect(db.select().from(practices).where(eq(practices.id, P)).get()!.archivedAt).toBeTruthy();
		expect(db.select().from(volumesDone).all()).toHaveLength(1);
	});
});
