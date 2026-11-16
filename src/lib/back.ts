/** Spec 007 A — «‹ previous screen»: nested screens get ?from=today|week|all and go back to that tab. */
const TABS: Record<string, string> = { today: 'Сегодня', week: 'Неделя', all: 'Все практики', inbox: 'Входящие', goals: 'Цели', links: 'Ссылки' };

export function backFrom(search: { get(name: string): string | null }, fallback: 'today' | 'week' | 'all' | 'inbox' | 'goals' | 'links' = 'today') {
	const from = search.get('from') ?? fallback;
	const tab = from in TABS ? from : fallback;
	return { label: TABS[tab], href: tab === 'today' ? '/' : tab === 'goals' || tab === 'links' ? `/${tab}` : `/?tab=${tab}` };
}
