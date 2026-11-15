import { describe, expect, it } from 'vitest';
import { appendTask, docToPlain, plainToDoc, splitTitle } from './inbox.js';
import { checklistStats, type NoteDoc } from './note.js';

describe('inbox text helpers (Spec 008)', () => {
	it('plain text ↔ note document, line by line', () => {
		expect(docToPlain(plainToDoc('  a\nb  \n'))).toBe('a\nb');
		expect(splitTitle(plainToDoc('\n Title \nline 2\nline 3'))).toEqual({ title: 'Title', rest: 'line 2\nline 3' });
	});
	it('appends a checklist item: joins a trailing checklist, else starts one; drops trailing empty paragraphs', () => {
		const a = appendTask(null, plainToDoc('first'));
		expect(a.content).toHaveLength(1);
		const b = appendTask(a, plainToDoc('second\nmore'));
		expect(b.content).toHaveLength(1);
		expect(checklistStats(b)).toEqual({ total: 2, checked: 0 });
		const withText: NoteDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'note' }] }, { type: 'paragraph' }] };
		const c = appendTask(withText, plainToDoc('x'));
		expect(c.content!.map((n) => n.type)).toEqual(['paragraph', 'taskList']);
	});
});
