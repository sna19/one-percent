import { parseHelp, type HelpDoc } from './md.js';

/**
 * Spec 011 — help texts live in src/lib/help/<screen>.md and are bundled into the app (they work offline).
 * Definition of Done: a change to a screen, button, icon or gesture updates its file in the same commit.
 */
const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const HELP: Record<string, HelpDoc> = Object.fromEntries(
	Object.entries(files).map(([path, src]) => [path.slice(2, -3), parseHelp(src)])
);

/** Icon names a help text may use as :icon-<name>: — the same components the screens use. */
export const ICON_NAMES = [
	'check',
	'star',
	'note',
	'day',
	'grip',
	'settings',
	'pencil',
	'more',
	'left',
	'right',
	'target',
	'shapes',
	'layers',
	'calendar-plus',
	'plus',
	'archive',
	'link',
	'collapse',
	'expand',
	'history',
	'help',
	'inbox',
	'flag',
	'when',
	'sliders',
	'badge-check'
] as const;
