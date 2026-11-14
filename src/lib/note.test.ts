import { describe, expect, it } from 'vitest';
import { firstLine, firstLineParts, isNoteDoc, safeHref, sanitizeLinks, type NoteDoc } from './note.js';

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

describe('day notes (Spec 006)', async () => {
	const { uncheck, checklistStats, checklistAmount, toggleTask } = await import('./note.js');
	const task = (t: string, checked: boolean) => ({ type: 'taskItem', attrs: { checked }, content: [p(t)] });
	const meals = doc(p('Питание'), {
		type: 'taskList',
		content: [task('завтрак', true), task('обед', true), task('ужин', false), task('вечер', false)]
	}, { type: 'bulletList', content: [{ type: 'listItem', content: [p('вода')] }] });
	const dose = { minDose: 1, normDose: 3 };

	it('counts only checklist boxes', () => {
		expect(checklistStats(meals)).toEqual({ total: 4, checked: 2 });
	});
	it('depth by the table: all → norm, half → min, less → 0, no checklist → manual', () => {
		expect(checklistAmount(meals, dose)).toBe(1);
		expect(checklistAmount(toggleTask(toggleTask(meals, 2), 3), dose)).toBe(3);
		expect(checklistAmount(toggleTask(meals, 0), dose)).toBe(0);
		expect(checklistAmount(doc(p('без чеклиста')), dose)).toBeNull();
		expect(checklistAmount(null, dose)).toBeNull();
	});
	it('uncheck clears every box and leaves the source untouched', () => {
		const fresh = uncheck(meals);
		expect(checklistStats(fresh)).toEqual({ total: 4, checked: 0 });
		expect(checklistStats(meals)).toEqual({ total: 4, checked: 2 });
	});
	it('toggleTask flips one box by position', () => {
		expect(checklistStats(toggleTask(meals, 3))).toEqual({ total: 4, checked: 3 });
	});
});

describe('safeHref', () => {
	it('keeps http, https and mailto', () => {
		expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
		expect(safeHref('HTTP://example.com')).toBe('HTTP://example.com');
		expect(safeHref('mailto:me@example.com')).toBe('mailto:me@example.com');
	});
	it('adds a scheme to a bare address', () => {
		expect(safeHref(' example.com/x ')).toBe('https://example.com/x');
		expect(safeHref('localhost:8080/x')).toBe('https://localhost:8080/x');
		expect(safeHref('me@example.com')).toBe('mailto:me@example.com');
	});
	it('rejects everything else', () => {
		for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc', 'https://', 'a b', '', null, 5])
			expect(safeHref(bad)).toBeNull();
	});
});

describe('sanitizeLinks', () => {
	it('normalises safe links and removes unsafe ones, keeping other marks', () => {
		const d = doc({
			type: 'paragraph',
			content: [
				{ type: 'text', text: 'a', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'x.org', target: '_self' } }] },
				{ type: 'text', text: 'b', marks: [{ type: 'link', attrs: { href: 'javascript:1' } }] }
			]
		});
		const [a, b] = sanitizeLinks(d).content![0].content!;
		expect(a.marks).toEqual([{ type: 'bold' }, { type: 'link', attrs: { href: 'https://x.org' } }]);
		expect(b.marks).toEqual([]);
	});
});

describe('firstLineParts', () => {
	it('splits the first line into text and links', () => {
		const d = doc(
			{ type: 'paragraph' },
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: '  Читать ' },
					{ type: 'text', text: 'учебник', marks: [{ type: 'link', attrs: { href: 'https://a.example' } }] },
					{ type: 'text', text: ' и ', marks: [{ type: 'bold' }] },
					{ type: 'text', text: 'плохо', marks: [{ type: 'link', attrs: { href: 'javascript:1' } }] }
				]
			}
		);
		expect(firstLineParts(d)).toEqual([
			{ text: 'Читать ', href: null },
			{ text: 'учебник', href: 'https://a.example' },
			{ text: ' и плохо', href: null }
		]);
		expect(firstLineParts(d).map((x) => x.text).join('')).toBe(firstLine(d));
		expect(firstLineParts(null)).toEqual([]);
	});
});
