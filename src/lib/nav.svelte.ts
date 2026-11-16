import type { DateStr } from './dates.js';

/**
 * #21 (Spec 007 addendum) — tabs as in iOS: the bar is on every screen and each tab keeps its own stack.
 * Leaving «Неделя › План» for «Входящие» and tapping «Неделя» again brings back the plan at the same scroll;
 * a second tap on the active tab goes to its root. The memory lives in this module: it survives moving
 * between screens, not a reload — a cold start opens on «Сегодня» as before (Spec 004).
 */
export type Tab = 'inbox' | 'today' | 'week' | 'goals' | 'links';

export const ROOT: Record<Tab, string> = { inbox: '/?tab=inbox', today: '/', week: '/?tab=week', goals: '/goals', links: '/links' };
const isTab = (t: string | null): t is Tab => !!t && t in ROOT;

/** The tab a screen belongs to: a root by its ?tab, a nested screen by ?from, otherwise the stack it was opened in. */
type Loc = { pathname: string; search: string; searchParams: { get(name: string): string | null } };

export function tabOf(url: Loc, current: Tab): Tab {
	if (url.pathname === '/goals') return 'goals';
	if (url.pathname === '/links') return 'links';
	if (url.pathname === '/') {
		const t = url.searchParams.get('tab');
		// #27: «Все практики» left the tab bar — it belongs to the tab it was opened from
		if (t === 'all') {
			const f = url.searchParams.get('from');
			return isTab(f) ? f : current;
		}
		return isTab(t) ? t : 'today';
	}
	const f = url.searchParams.get('from');
	return isTab(f) ? f : current;
}

export const keyOf = (url: Loc) => url.pathname + url.search;

class Nav {
	tab = $state<Tab>('today');
	/** the last screen of each tab's stack */
	last: Partial<Record<Tab, string>> = {};
	/** scroll position of each screen, by path and query */
	scroll = new Map<string, number>();
	/** «Сегодня» and «Неделя» state that a screen of the same route would lose: the day, the open card, the week */
	home: { viewDay?: DateStr; expanded?: number | null; start?: DateStr; at?: number } = {};
	/** Spec 013: horizontal scroll of each «Цели» ribbon, by category */
	ribbons = new Map<number, number>();
	/** bumped on a second tap of the active root tab: the screen goes back to its start (today, top) */
	rootTap = $state(0);

	/**
	 * Scrolls to the remembered place of `key`. The screen may still be filling (the week comes from the
	 * cache or the server), so it keeps trying for up to two seconds until the page is tall enough.
	 */
	restore(key: string) {
		const y = this.scroll.get(key);
		if (y === undefined) return;
		const until = Date.now() + 2000;
		const go = () => {
			if (document.documentElement.scrollHeight >= y + window.innerHeight || Date.now() > until) window.scrollTo(0, y);
			else requestAnimationFrame(go);
		};
		requestAnimationFrame(go);
	}
}

export const nav = new Nav();

/** The screen of the root page: a tab of it, or «Все практики» (#27: no longer a tab). */
export function screenOf(url: Loc): 'inbox' | 'today' | 'week' | 'all' {
	const t = url.searchParams.get('tab');
	return t === 'inbox' || t === 'week' || t === 'all' ? t : 'today';
}
