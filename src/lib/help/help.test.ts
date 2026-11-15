import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from './index.js';
import { inline, parseHelp } from './md.js';

const dir = new URL('.', import.meta.url).pathname;
const topics = Object.fromEntries(
	readdirSync(dir)
		.filter((f) => f.endsWith('.md'))
		.map((f) => [f.slice(0, -3), parseHelp(readFileSync(join(dir, f), 'utf8'))])
);

function walk(src: string, re: RegExp) {
	return [...src.matchAll(re)].map((m) => m[1]);
}

describe('help markdown', () => {
	it('parses title, lead, headings, bullets, tables and inline marks', () => {
		const d = parseHelp('# T\n\nlead **b** :icon-star: [С](help:glossary)\n\n## H\n- a\n- b\n\n| x | y |\n| --- | --- |\n| 1 | 2 |');
		expect(d.title).toBe('T');
		expect(d.blocks.map((b) => b.t)).toEqual(['p', 'h', 'ul', 'table']);
		expect(inline('a **b** :icon-star: [С](help:glossary)')).toEqual([
			{ t: 'text', text: 'a ' },
			{ t: 'bold', text: 'b' },
			{ t: 'text', text: ' ' },
			{ t: 'icon', name: 'star' },
			{ t: 'text', text: ' ' },
			{ t: 'link', text: 'С', topic: 'glossary' }
		]);
	});
	it('keeps HTML as plain text', () => {
		expect(inline('<img src=x onerror=alert(1)>')).toEqual([{ t: 'text', text: '<img src=x onerror=alert(1)>' }]);
	});
});

describe('help texts (Spec 011)', () => {
	it('every screen with a TopBar has its topic, and a glossary exists', () => {
		const routes = readdirSync(new URL('../../routes', import.meta.url).pathname, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.svelte'));
		const used = routes.flatMap((f) => walk(readFileSync(new URL(`../../routes/${f}`, import.meta.url), 'utf8'), /<TopBar help="([a-z-]+)"/g));
		const withBar = routes.filter((f) => readFileSync(new URL(`../../routes/${f}`, import.meta.url), 'utf8').includes('<TopBar'));
		expect(used.length).toBeGreaterThanOrEqual(withBar.length);
		for (const t of [...used, 'glossary', 'note']) expect(topics[t]?.title, t).toBeTruthy();
	});
	it('uses only known icons and topics', () => {
		for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
			const src = readFileSync(join(dir, f), 'utf8');
			for (const i of walk(src, /:icon-([a-z0-9-]+):/g)) expect(ICON_NAMES, `${f}: ${i}`).toContain(i);
			for (const l of walk(src, /\(help:([a-z0-9-]+)\)/g)) expect(topics[l], `${f}: ${l}`).toBeTruthy();
		}
	});
	it('each text stays short enough for one phone screen', () => {
		for (const [k, d] of Object.entries(topics)) {
			const words = JSON.stringify(d.blocks).replace(/"[a-z]+":/g, '').split(/\s+/).length;
			expect(words, k).toBeLessThan(260);
		}
	});
});
