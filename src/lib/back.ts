/** Spec 007 A — «‹ previous screen»: nested screens get ?from=today|week|all and go back to that tab. */
const TABS: Record<string, string> = { today: 'Сегодня', week: 'Неделя', all: 'Всё' };

export function backFrom(search: { get(name: string): string | null }, fallback: 'today' | 'week' | 'all' = 'today') {
	const from = search.get('from') ?? fallback;
	const tab = from in TABS ? from : fallback;
	return { label: TABS[tab], href: tab === 'today' ? '/' : `/?tab=${tab}` };
}
