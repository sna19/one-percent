/** Spec 005 — a practice's standing note, stored as Tiptap (ProseMirror) JSON. */

export interface NoteNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: { type: string; attrs?: Record<string, unknown> }[];
	content?: NoteNode[];
}

export type NoteDoc = NoteNode & { type: 'doc' };

/** Upper bound for a stored note (JSON characters). */
export const NOTE_MAX = 100_000;

const BLOCKS = new Set(['paragraph', 'heading']);

function textOf(n: NoteNode): string {
	if (n.type === 'text') return n.text ?? '';
	if (n.type === 'hardBreak') return ' ';
	return (n.content ?? []).map(textOf).join('');
}

/** First non-empty text block (paragraph, list or checklist item), plain, on one line. */
export function firstLine(doc: NoteDoc | null | undefined): string {
	const walk = (nodes: NoteNode[] | undefined): string => {
		for (const n of nodes ?? []) {
			if (BLOCKS.has(n.type)) {
				const t = textOf(n).replace(/\s+/g, ' ').trim();
				if (t) return t;
			} else {
				const t = walk(n.content);
				if (t) return t;
			}
		}
		return '';
	};
	return doc ? walk(doc.content) : '';
}

export function isEmptyNote(doc: NoteDoc | null | undefined): boolean {
	return !firstLine(doc);
}

/** Shape check before storing: a doc of nodes with string types and text. Content is never rendered as HTML. */
export function isNoteDoc(v: unknown): v is NoteDoc {
	const node = (n: unknown, depth: number): boolean => {
		if (depth > 50 || !n || typeof n !== 'object') return false;
		const o = n as NoteNode;
		if (typeof o.type !== 'string') return false;
		if (o.text !== undefined && typeof o.text !== 'string') return false;
		if (o.content !== undefined && (!Array.isArray(o.content) || !o.content.every((c) => node(c, depth + 1)))) return false;
		return true;
	};
	return node(v, 0) && (v as NoteNode).type === 'doc';
}

// ── Spec 006: day notes and marks by checklist ─────────────────────────────

/** A copy with every checklist box cleared — how day notes move to a new week or a template. */
export function uncheck<T extends NoteNode>(n: T): T {
	const copy = { ...n } as T;
	if (n.type === 'taskItem') copy.attrs = { ...(n.attrs ?? {}), checked: false };
	if (n.content) copy.content = n.content.map(uncheck);
	return copy;
}

/** Checklist boxes in a note: how many, and how many are ticked. Plain text and bullets do not count. */
export function checklistStats(doc: NoteDoc | null | undefined): { total: number; checked: number } {
	let total = 0;
	let checked = 0;
	const walk = (n: NoteNode) => {
		if (n.type === 'taskItem') {
			total++;
			if (n.attrs?.checked) checked++;
		}
		n.content?.forEach(walk);
	};
	if (doc) walk(doc);
	return { total, checked };
}

/**
 * The day's amount for a practice marked by checklist: all ticked → norm, half or more → minimum,
 * less → nothing (0). null when the note has no checklist: then the practice is marked by hand.
 */
export function checklistAmount(doc: NoteDoc | null | undefined, p: { minDose: number; normDose: number }): number | null {
	const { total, checked } = checklistStats(doc);
	if (!total) return null;
	if (checked === total) return p.normDose;
	if (checked * 2 >= total) return p.minDose;
	return 0;
}

/** Ticks or clears the box at position `index` (in document order) — the one-tap mark on the card. */
export function toggleTask(doc: NoteDoc, index: number): NoteDoc {
	let i = -1;
	const walk = (n: NoteNode): NoteNode => {
		const copy: NoteNode = { ...n };
		if (n.type === 'taskItem' && ++i === index) copy.attrs = { ...(n.attrs ?? {}), checked: !n.attrs?.checked };
		if (n.content) copy.content = n.content.map(walk);
		return copy;
	};
	return walk(doc) as NoteDoc;
}
