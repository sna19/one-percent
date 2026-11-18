import type { NoteDoc, NoteNode } from './note.js';

/** Spec 008 — «Входящие»: shared between the screen and the server. */

export type InboxStatus = 'open' | 'done' | 'processed' | 'deleted';

export interface InboxItemView {
	id: number | null;
	/** made on the device; the server keeps it, so a replayed offline write is not duplicated */
	clientId: string;
	text: NoteDoc;
	createdAt: string;
	updatedAt: string;
	status: InboxStatus;
	closedAt: string | null;
	target: string | null;
	/** only on the device: written offline, not on the server yet */
	pending?: boolean;
}

/** History keeps closed and sorted items for 30 days. */
/* #29: the history's term and the age mark are registry settings («inbox.history_days», «stale_days») */
/** An open item older than this gets a quiet «2 нед» label. */


/** The quick capture field is plain text: each line becomes a paragraph of a note document. */
export function plainToDoc(s: string): NoteDoc {
	const lines = s.replace(/\r\n?/g, '\n').trim().split('\n');
	return {
		type: 'doc',
		content: lines.map((l) => (l.trim() ? { type: 'paragraph', content: [{ type: 'text', text: l.trimEnd() }] } : { type: 'paragraph' }))
	};
}

function textOf(n: NoteNode): string {
	if (n.type === 'text') return n.text ?? '';
	if (n.type === 'hardBreak') return '\n';
	return (n.content ?? []).map(textOf).join('');
}

/** Paragraph-level blocks of a document as plain lines (lists flattened). */
function lines(doc: NoteDoc): string[] {
	const out: string[] = [];
	const walk = (nodes: NoteNode[] | undefined) => {
		for (const n of nodes ?? []) {
			if (n.type === 'paragraph' || n.type === 'heading') out.push(textOf(n));
			else walk(n.content);
		}
	};
	walk(doc.content);
	return out;
}

export function docToPlain(doc: NoteDoc): string {
	return lines(doc).join('\n').trim();
}

/** The first non-empty paragraph — the title of a new practice or goal — and the rest. */
export function splitTitle(doc: NoteDoc): { title: string; rest: string } {
	const ls = lines(doc).map((l) => l.trim());
	const i = ls.findIndex(Boolean);
	if (i < 0) return { title: '', rest: '' };
	return { title: ls[i], rest: ls.slice(i + 1).join('\n').trim() };
}

/**
 * Appends the item to a note as one checklist item (Spec 008: «пунктом чеклиста»). It joins the checklist
 * at the end of the note, or starts a new one there. Empty paragraphs of the item are dropped.
 */
export function appendTask(note: NoteDoc | null | undefined, item: NoteDoc): NoteDoc {
	const paras = lines(item)
		.map((l) => l.trim())
		.filter(Boolean)
		.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] }));
	const task: NoteNode = { type: 'taskItem', attrs: { checked: false }, content: paras.length ? paras : [{ type: 'paragraph' }] };
	const content = [...(note?.content ?? [])];
	// a note that is a single empty paragraph counts as empty
	while (content.length && content[content.length - 1].type === 'paragraph' && !textOf(content[content.length - 1]).trim()) content.pop();
	const last = content[content.length - 1];
	if (last?.type === 'taskList') content[content.length - 1] = { ...last, content: [...(last.content ?? []), task] };
	else content.push({ type: 'taskList', content: [task] });
	return { type: 'doc', content };
}

/** Whole days between two ISO times (b later). */
export const ageDays = (fromIso: string, now: Date) => Math.floor((now.getTime() - Date.parse(fromIso)) / 86_400_000);
