import { describe, expect, it } from 'vitest';
import { firstLine, isNoteDoc, type NoteDoc } from './note.js';

const doc = (...content: object[]) => ({ type: 'doc', content }) as NoteDoc;
const p = (...t: string[]) => ({ type: 'paragraph', content: t.map((text) => ({ type: 'text', text })) });

describe('firstLine', () => {
	it('takes the first non-empty paragraph, plain', () => {
		const d = doc({ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'Таблички ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'в библиотеку' }] });
		expect(firstLine(d)).toBe('Таблички в библиотеку');
	});
	it('takes a list or checklist item', () => {
		expect(firstLine(doc({ type: 'bulletList', content: [{ type: 'listItem', content: [p('  первый  пункт ')] }] }))).toBe('первый пункт');
		expect(
			firstLine(doc({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p('шаг 1')] }] }))
		).toBe('шаг 1');
	});
	it('empty note has no line', () => {
		expect(firstLine(doc({ type: 'paragraph' }))).toBe('');
		expect(firstLine(null)).toBe('');
	});
});

describe('isNoteDoc', () => {
	it('accepts a doc and rejects other shapes', () => {
		expect(isNoteDoc(doc(p('a')))).toBe(true);
		expect(isNoteDoc({ type: 'paragraph' })).toBe(false);
		expect(isNoteDoc({ type: 'doc', content: [{ type: 1 }] })).toBe(false);
		expect(isNoteDoc('<b>x</b>')).toBe(false);
	});
});
