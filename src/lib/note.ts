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

/**
 * Task 11: the same first line as `firstLine`, in pieces, so links on a collapsed card stay tappable.
 * Each piece is plain text or a link with a safe address; spaces are collapsed like in `firstLine`.
 */
export function firstLineParts(doc: NoteDoc | null | undefined): { text: string; href: string | null }[] {
	const find = (nodes: NoteNode[] | undefined): NoteNode | null => {
		for (const n of nodes ?? []) {
			if (BLOCKS.has(n.type)) {
				if (textOf(n).trim()) return n;
			} else {
				const f = find(n.content);
				if (f) return f;
			}
		}
		return null;
	};
	const block = doc ? find(doc.content) : null;
	if (!block) return [];
	const parts: { text: string; href: string | null }[] = [];
	for (const n of block.content ?? []) {
		const text = textOf(n);
		const href = safeHref(n.marks?.find((m) => m.type === 'link')?.attrs?.href);
		const last = parts.at(-1);
		if (last && last.href === href) last.text += text;
		else parts.push({ text, href });
	}
	for (const p of parts) p.text = p.text.replace(/\s+/g, ' ');
	if (parts.length) {
		parts[0].text = parts[0].text.trimStart();
		parts[parts.length - 1].text = parts[parts.length - 1].text.trimEnd();
	}
	return parts.filter((p) => p.text);
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

// ── Task 11: links in notes ────────────────────────────────────────────────

/**
 * A link address that is safe to store and open: only http, https and mailto. An address without a
 * scheme gets https:// (a bare e-mail gets mailto:). Anything else (javascript:, data:, …) → null.
 */
export function safeHref(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const s = raw.trim();
	if (!s || s.length > 2000 || /[\s<>"]/.test(s)) return null;
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
	if (!scheme) {
		if (/^[^@/]+@[^@/]+\.[^@/]+$/.test(s)) return `mailto:${s}`;
		if (s.startsWith('//')) return `https:${s}`;
		return `https://${s}`;
	}
	const name = scheme[1].toLowerCase();
	// «example.com:8080/x» is a host with a port, not a scheme
	if ((name.includes('.') || name === 'localhost') && /^\d+(\/|$)/.test(s.slice(scheme[0].length)))
		return `https://${s}`;
	if (name === 'http' || name === 'https') return /^https?:\/\/[^/]/i.test(s) ? s : null;
	if (name === 'mailto') return s.length > 7 ? s : null;
	return null;
}

/** A copy where every link mark has a safe address; unsafe links lose the link, the text stays. */
export function sanitizeLinks<T extends NoteNode>(n: T): T {
	const copy = { ...n } as T;
	if (n.marks) {
		copy.marks = n.marks.flatMap((m) => {
			if (m.type !== 'link') return [m];
			const href = safeHref(m.attrs?.href);
			return href ? [{ type: 'link', attrs: { href } }] : [];
		});
	}
	if (n.content) copy.content = n.content.map(sanitizeLinks);
	return copy;
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
