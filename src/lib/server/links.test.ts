import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { setNote } from './note.js';
import { linkGroups, setInLinks, setLinksOrder } from './links.js';

describe('#27 links tab', () => {
	it('marked practices with the links of their standing note, in the chosen order', () => {
		const { db } = openDb(':memory:');
		seedIfEmpty(db);
		const doc = (href: string, text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }] }] });
		setNote(db, 1, doc('https://duolingo.com', 'Дуолинго'), '2026-11-16T10:00:00Z');
		setNote(db, 3, doc('https://hbr.org', 'HBR'), '2026-11-16T10:00:00Z');
		expect(linkGroups(db)).toEqual([]);
		setInLinks(db, 1, true);
		setInLinks(db, 3, true);
		expect(linkGroups(db).map((g) => [g.practiceId, g.links[0].text])).toEqual([
			[1, 'Дуолинго'],
			[3, 'HBR']
		]);
		setLinksOrder(db, [3, 1]);
		expect(linkGroups(db).map((g) => g.practiceId)).toEqual([3, 1]);
		setInLinks(db, 1, false);
		expect(linkGroups(db).map((g) => g.practiceId)).toEqual([3]);
	});
});
