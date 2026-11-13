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
