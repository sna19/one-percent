/**
 * Spec 011 — a tiny Markdown subset for help texts, parsed into blocks that a Svelte component renders.
 * No HTML is produced or passed through, so the texts need no sanitizer: anything unknown stays plain text.
 *
 *   # Title                  — the sheet title (first line)
 *   first paragraph          — «для чего этот экран»
 *   ## Heading               — a section («Иконки», «Жесты», «Правила»)
 *   - item                   — a bullet
 *   | a | b |                — a table row (a row of only dashes is the header separator)
 *   **bold**, :icon-star:, [Словарь](help:glossary)
 */

export type Inline =
	| { t: 'text'; text: string }
	| { t: 'bold'; text: string }
	| { t: 'icon'; name: string }
	| { t: 'link'; text: string; topic: string };

export type Block =
	| { t: 'p'; inl: Inline[] }
	| { t: 'h'; text: string }
	| { t: 'ul'; items: Inline[][] }
	| { t: 'table'; head: Inline[][]; rows: Inline[][][] };

export interface HelpDoc {
	title: string;
	blocks: Block[];
}

const INLINE = /\*\*(.+?)\*\*|:icon-([a-z0-9-]+):|\[([^\]]+)\]\(help:([a-z0-9-]+)\)/g;

export function inline(s: string): Inline[] {
	const out: Inline[] = [];
	let at = 0;
	for (const m of s.matchAll(INLINE)) {
		if (m.index > at) out.push({ t: 'text', text: s.slice(at, m.index) });
		if (m[1] !== undefined) out.push({ t: 'bold', text: m[1] });
		else if (m[2] !== undefined) out.push({ t: 'icon', name: m[2] });
		else out.push({ t: 'link', text: m[3], topic: m[4] });
		at = m.index + m[0].length;
	}
	if (at < s.length) out.push({ t: 'text', text: s.slice(at) });
	return out;
}

const cells = (line: string) =>
	line
		.trim()
		.replace(/^\||\|$/g, '')
		.split('|')
		.map((c) => c.trim());

export function parseHelp(src: string): HelpDoc {
	const lines = src.replace(/\r\n?/g, '\n').split('\n');
	let title = '';
	const blocks: Block[] = [];
	let para: string[] = [];
	const flush = () => {
		if (para.length) blocks.push({ t: 'p', inl: inline(para.join(' ')) });
		para = [];
	};
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			flush();
			continue;
		}
		const last = blocks[blocks.length - 1];
		if (line.startsWith('# ') && !title) {
			flush();
			title = line.slice(2).trim();
		} else if (line.startsWith('## ')) {
			flush();
			blocks.push({ t: 'h', text: line.slice(3).trim() });
		} else if (line.startsWith('- ')) {
			flush();
			const item = inline(line.slice(2).trim());
			if (last?.t === 'ul') last.items.push(item);
			else blocks.push({ t: 'ul', items: [item] });
		} else if (line.startsWith('|')) {
			flush();
			const row = cells(line);
			if (row.every((c) => /^:?-+:?$/.test(c))) continue;
			if (last?.t === 'table') last.rows.push(row.map(inline));
			else blocks.push({ t: 'table', head: row.map(inline), rows: [] });
		} else para.push(line);
	}
	flush();
	return { title, blocks };
}
