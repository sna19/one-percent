<script lang="ts">
	import { onMount } from 'svelte';
	import { addDays, todayStr, weekDays, weekStart } from '#lib/dates.js';
	import { colorOf } from '#lib/palette.js';
	import { counts, daysWithout, depth, priority } from '#lib/rules.js';
	import {
		dayScore,
		groupCell,
		groupDaysWithout,
		groupPractices,
		planDayScore,
		planPractices,
		planWeekSummary,
		type Lens
	} from '#lib/groups.js';
	import { cacheWeek, cachedWeek, enqueue, enqueueDayNote, enqueueNote, flush, pending, pendingDayNotes, pendingNotes } from '#lib/store.js';
	import { dayTitle, doseHint, mergeOrder, moveTo, todayLists } from '#lib/today.js';
	import { crossfade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import NoteSheet from '#lib/NoteSheet.svelte';
	import TopBar from '#lib/TopBar.svelte';
	import TabBar from '#lib/TabBar.svelte';
	import QuickCapture from '#lib/inbox/QuickCapture.svelte';
	import InboxScreen from '#lib/inbox/InboxScreen.svelte';
	import { inbox } from '#lib/inbox/state.svelte.js';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Target from '@lucide/svelte/icons/target';
	import Shapes from '@lucide/svelte/icons/shapes';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Layers from '@lucide/svelte/icons/layers';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Star from '@lucide/svelte/icons/star';
	import Flag from '@lucide/svelte/icons/flag';
	import { amountLabel, budgetLabel, remaining, todayAdds } from '#lib/milestones.js';
	import FilePen from '@lucide/svelte/icons/file-pen';
	import NoteHead from '#lib/NoteHead.svelte';
	import Tree from '#lib/Tree.svelte';
	import { treeOfPractices } from '#lib/tree.js';
	import DayIcon from '#lib/DayIcon.svelte';
	import NoteView from '#lib/NoteView.svelte';
	import { checklistAmount, checklistStats, firstBlockDoc, firstLine, toggleTask, type NoteDoc } from '#lib/note.js';
	import type { PracticeView, WeekData } from '#lib/types.js';

	const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
	const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

	let today = $state(todayStr());
	let start = $state(weekStart(todayStr()));
	let week = $state<WeekData | undefined>();
	let offline = $state(false);
	/** Why the last load failed: no network, or the server answered with an error. */
	let problem = $state<string | undefined>();
	let queued = $state(0);
	/** Spec 005: the practice sheet (dose for a day + the standing note). */
	/** Spec 006: a planned day opens on its day note, with a link to the practice's standing note. */
	let sheet = $state<{ pid: number; date: string; mode: 'day' | 'practice' } | undefined>();
	const sheetPractice = $derived(sheet ? week?.practices.find((x) => x.id === sheet!.pid) : undefined);
	function openSheet(p: PracticeView, date: string, mode?: 'day' | 'practice') {
		clearTimeout(timer);
		sheet = { pid: p.id, date, mode: mode ?? (isPlanned(p.id, date) ? 'day' : 'practice') };
	}
	const dayNoteOf = (pid: number, date: string): NoteDoc | null => week?.plan?.notes?.[`${pid}|${date}`]?.note ?? null;
	/** marked by its day checklist: the practice has the setting and the day note has boxes */
	const byChecklist = (p: PracticeView, date: string) =>
		p.checklistMarks && checklistStats(dayNoteOf(p.id, date)).total > 0;

	const days = $derived(weekDays(start));
	const isCurrentWeek = $derived(start === weekStart(today));

	const amountOf = (pid: number, date: string) => week?.entries[pid]?.[date];

	// Per-device view settings (Spec 002): lens and which groups are open.
	const read = <T,>(k: string, fallback: T): T => {
		try {
			const v = localStorage.getItem(k);
			return v ? (JSON.parse(v) as T) : fallback;
		} catch {
			return fallback;
		}
	};
	const write = (k: string, v: unknown) => {
		try {
			localStorage.setItem(k, JSON.stringify(v));
		} catch {
			/* private mode: keep in memory only */
		}
	};
	/**
	 * Spec 004: three tabs. «Сегодня» always opens first (not remembered, so a morning starts on the
	 * working screen); «Неделя» is the plan view of Spec 003; «Всё» holds the goal / format lens.
	 */
	type Tab = 'inbox' | 'today' | 'week' | 'all';
	type View = 'plan' | Lens;
	let tab = $state<Tab>('today');
	let capture: QuickCapture;
	let allLens = $state<Lens>(read('all-lens', 'goal'));
	const lens = $derived<View>(tab === 'week' ? 'plan' : allLens);
	let open = $state<string[]>(read('open-groups', []));
	function setTab(t: Tab) {
		tab = t;
		// the Today tab always comes back to today
		if (t === 'today') {
			viewDay = today;
			if (start !== weekStart(today)) toToday();
		}
	}
	function setLens(l: Lens) {
		allLens = l;
		write('all-lens', l);
	}
	function toggle(key: string) {
		open = open.includes(key) ? open.filter((k) => k !== key) : [...open, key];
		write('open-groups', open);
	}

	const practices = $derived(week?.practices ?? []);
	const plannedSet = $derived(
		new Set(Object.entries(week?.plan?.items ?? {}).flatMap(([pid, ds]) => ds.map((d) => `${pid}|${d}`)))
	);
	const isPlanned = (pid: number, d: string) => plannedSet.has(`${pid}|${d}`);
	const isPlan = $derived(lens === 'plan');
	const groups = $derived(
		isPlan
			? groupPractices(planPractices(practices, days, isPlanned, amountOf), 'goal')
			: groupPractices(practices, lens as Lens)
	);
	const summary = $derived(planWeekSummary(practices, days, isPlanned, amountOf));
	/** Spec 007 E: Today pages by day — this week and next. */
	let viewDay = $state(todayStr());
	const isFutureDay = $derived(viewDay > today);
	const minDay = $derived(weekStart(today));
	const maxDay = $derived(addDays(weekStart(today), 13));
	// Spec 010 «Ротация»: weeks where a goal had no practices in the plan do not add to «N дней без»
	const paused = $derived(new Map(Object.entries(week?.pausedWeeks ?? {}).map(([g, ws]) => [Number(g), new Set(ws)])));
	const pausedOf = (goalId: number) => paused.get(goalId);
	const day = $derived(todayLists(practices, viewDay, isPlanned, amountOf, pausedOf));
	// #12: «Сделать что-то ещё» — recommended first as their own list, the rest as the settings tree
	const recommended = $derived(day.other.filter((p) => p.recommended));
	const otherTree = $derived(treeOfPractices(day.other.filter((p) => !p.recommended)));
	function dayName(d: string) {
		if (d === today) return 'Сегодня';
		if (d === addDays(today, 1)) return 'Завтра';
		if (d === addDays(today, -1)) return 'Вчера';
		return dayTitle(d);
	}
	function showDay(d: string) {
		if (d < minDay || d > maxDay) return;
		viewDay = d;
		const s = weekStart(d);
		if (s !== start) {
			start = s;
			week = undefined;
			load(s);
		}
	}
	// horizontal swipe on the day screen = previous / next day
	let swipe: { x: number; y: number } | null = null;
	function swipeStart(e: PointerEvent) {
		if (reorder || e.pointerType === 'mouse') return;
		swipe = { x: e.clientX, y: e.clientY };
	}
	function swipeEnd(e: PointerEvent) {
		if (!swipe) return;
		const dx = e.clientX - swipe.x;
		const dy = e.clientY - swipe.y;
		swipe = null;
		if (Math.abs(dx) > 70 && Math.abs(dy) < 45) showDay(addDays(viewDay, dx < 0 ? 1 : -1));
	}
	/** future day: change what is planned for it (today: unchanged rules; past: locked) */
	async function setPlanned(p: PracticeView, planned: boolean) {
		if (!planned && dayNoteOf(p.id, viewDay) && !window.confirm(`Убрать «${p.title}» из плана дня? Заметка дня удалится.`)) return;
		try {
			const r = await fetch('/api/plan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'item', start: weekStart(viewDay), today, practiceId: p.id, date: viewDay, planned })
			});
			if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Не сохранилось');
			sheet = undefined;
			await load();
		} catch (e) {
			problem = (e as Error).message;
		}
	}
	let moreOpen = $state(false);
	/** task 13: the card whose «±» quantity field is open */
	let qtyOpen = $state<number | undefined>();

	/** «3 рекомендовано · 15», or just «15» */
	function otherCount(other: PracticeView[]) {
		const rec = other.filter((x) => x.recommended).length;
		return rec ? `${rec} рекомендовано · ${other.length}` : String(other.length);
	}

	// task 12: the «Рекомендовать» star — shown at once, saved on the server; back on failure
	async function toggleRecommended(p: PracticeView) {
		const on = !p.recommended;
		const set = (v: boolean) => {
			const x = week?.practices.find((q) => q.id === p.id);
			if (x) x.recommended = v;
		};
		set(on);
		try {
			const r = await fetch('/api/settings/recommend', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: p.id, on })
			});
			if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Не сохранилось');
		} catch (e) {
			set(!on);
			problem = (e as Error).message;
		}
	}

	// «Порядок» (#9): drag cards by their ≡ handle; the order is the practices' order everywhere.
	/** 'tree' — a card in the tree of «Сделать что-то ещё»: its order comes from settings, no drag here */
	type ListName = 'todo' | 'done' | 'other' | 'tree';
	let reorder = $state(false);
	let drag = $state<{ list: ListName; id: number; ids: number[] } | undefined>();
	const listEls: Partial<Record<ListName, HTMLUListElement>> = {};
	function inOrder<T>(list: ListName, items: T[], idOf: (x: T) => number): T[] {
		if (drag?.list !== list) return items;
		const pos = new Map(drag.ids.map((id, i) => [id, i]));
		return [...items].sort((a, b) => (pos.get(idOf(a)) ?? 0) - (pos.get(idOf(b)) ?? 0));
	}
	function dragStart(e: PointerEvent, list: ListName, id: number, ids: number[]) {
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = { list, id, ids };
	}
	function dragMove(e: PointerEvent) {
		if (!drag) return;
		const ul = listEls[drag.list];
		if (!ul) return;
		const others = [...ul.children].filter((li) => (li as HTMLElement).dataset.id !== String(drag!.id));
		const to = others.filter((li) => {
			const r = li.getBoundingClientRect();
			return r.top + r.height / 2 < e.clientY;
		}).length;
		const next = moveTo(drag.ids, drag.id, to);
		if (next.join() !== drag.ids.join()) drag = { ...drag, ids: next };
	}
	async function dragEnd() {
		if (!drag || !week) return (drag = undefined);
		const order = mergeOrder(week.practices.map((p) => p.id), drag.ids);
		drag = undefined;
		const pos = new Map(order.map((id, i) => [id, i]));
		week.practices = [...week.practices].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
		await cacheWeek($state.snapshot(week));
		try {
			const r = await fetch('/api/order', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids: order })
			});
			if (!r.ok) throw new Error();
		} catch {
			problem = 'Порядок не сохранился: нет связи с сервером';
			offline = true;
		}
	}
	const [send, receive] = crossfade({ duration: 220 });

	// Spec 007 F: a tap opens one card at a time (not in «Порядок»)
	let expanded = $state<number | null>(null);
	function toggleCard(id: number) {
		if (reorder) return;
		expanded = expanded === id ? null : id;
	}

	const nOf = (p: PracticeView) => daysWithout(p.lastDone, p.createdOn, today, pausedOf(p.goalId));
	// Priority is chosen among goals; in the plan view only among goals planned for today.
	const top = $derived(
		priority(
			groupPractices(practices, 'goal')
				.filter((g) => !isPlan || g.practices.some((p) => isPlanned(p.id, today)))
				.map((g, i) => ({
					id: i,
					title: g.title,
					n: groupDaysWithout(g, today, pausedOf),
					doneToday: g.practices.some((p) => p.lastDone === today)
				}))
		)
	);
	const SOURCE_LABEL: Record<string, string> = {
		previous: 'по прошлой неделе',
		default: 'по обычным дням практик',
		empty: 'с нуля'
	};
	const sourceLabel = (src: string) =>
		SOURCE_LABEL[src] ??
		(src.startsWith('template:') ? 'по шаблону недели' : src.startsWith('week:') ? `по неделе с ${label(src.slice(5))}` : '');

	let confirming = $state(false);
	async function confirmDraft() {
		confirming = true;
		try {
			const r = await fetch('/api/plan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'confirm', start, today })
			});
			if (r.ok) await load();
		} catch {
			problem = 'Нет связи с сервером';
		} finally {
			confirming = false;
		}
	}

	function without(n: number) {
		const w = n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'дня' : 'дней';
		return `${n} ${w} без`;
	}

	function label(s: string) {
		const [, m, d] = s.split('-').map(Number);
		return `${d} ${MONTHS[m - 1]}`;
	}

	async function withPending(w: WeekData) {
		for (const m of await pending()) apply(w, m.practiceId, m.date, m.amount);
		for (const n of await pendingDayNotes()) {
			const k = `${n.practiceId}|${n.date}`;
			const cur = w.plan?.notes?.[k];
			if (w.plan && (!cur?.updatedAt || n.updatedAt > cur.updatedAt)) {
				if (n.note) w.plan.notes[k] = { note: n.note, updatedAt: n.updatedAt };
				else delete w.plan.notes[k];
			}
		}
		for (const n of await pendingNotes()) {
			const p = w.practices.find((x) => x.id === n.practiceId);
			if (p && (!p.noteUpdatedAt || n.updatedAt > p.noteUpdatedAt)) {
				p.note = n.note;
				p.noteUpdatedAt = n.updatedAt;
			}
		}
		return w;
	}

	async function load(s = start) {
		const cached = await cachedWeek(s);
		if (cached) await withPending(cached);
		if (cached && !week && s === start) week = cached;
		let r: Response;
		try {
			r = await fetch(`/api/week?start=${s}&today=${today}`);
		} catch {
			offline = true;
			problem = 'Нет связи с сервером';
			if (s === start) week = cached ?? week;
			queued = (await pending()).length;
			return;
		}
		try {
			const isJson = r.headers.get('content-type')?.includes('json');
			if (!r.ok || !isJson) {
				const body = isJson ? ((await r.json()).message ?? '') : '';
				throw new Error(`Ошибка сервера ${r.status}${body ? `: ${body}` : ''}`);
			}
			const fresh: WeekData = await r.json();
			await cacheWeek(fresh);
			await withPending(fresh); // local marks not on the server yet
			if (s === start) week = fresh;
			offline = false;
			problem = undefined;
		} catch (e) {
			offline = true;
			problem = e instanceof Error && e.message ? e.message : 'Ошибка сервера';
			if (s === start) week = cached ?? week;
		}
		queued = (await pending()).length;
	}

	function apply(w: WeekData, pid: number, date: string, amount: number) {
		(w.entries[pid] ??= {})[date] = amount;
		const p = w.practices.find((x) => x.id === pid);
		if (p && amount >= p.minDose && date <= today && (!p.lastDone || date > p.lastDone)) p.lastDone = date;
	}

	// Spec 009 C: a short flash after a mark — what it added to the goal's milestone; a tap opens the goal
	let flash = $state<{ text: string; goalId: number } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	function milestoneFlash(p: PracticeView, old: number, amount: number, before: number) {
		const m = week?.milestones?.[p.goalId];
		if (!m || !counts(amount, p) || amount <= old) return;
		const after = m.progressBefore + todayAdds(m, practices, (id) => amountOf(id, today), today);
		let text: string;
		if (m.budgetKind !== 'none' && m.budgetTarget) {
			if (before < m.budgetTarget && after >= m.budgetTarget) text = 'Бюджет майлстона набран — проверишь себя?';
			else {
				const plus = m.budgetKind === 'amount' && p.unit === m.budgetUnit ? `+${amountLabel(amount - old, p.unit)} ` : after > before ? '+1 занятие ' : '';
				text = `${plus}→ ${m.title} · ${budgetLabel(m, after)}`;
			}
		} else {
			const rem = remaining(m.dueDate, today);
			text = `→ ${m.title}${rem ? ` · ${rem}` : ''}`;
		}
		flash = { text, goalId: p.goalId };
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 2500);
	}

	async function mark(p: PracticeView, date: string, amount: number) {
		if (!week || date > today) return;
		const old = amountOf(p.id, date) ?? 0;
		const m = week.milestones?.[p.goalId];
		const before = m ? m.progressBefore + todayAdds(m, practices, (id) => amountOf(id, today), today) : 0;
		apply(week, p.id, date, amount);
		if (date === today) milestoneFlash(p, old, amount, before);
		await cacheWeek($state.snapshot(week));
		await enqueue({ practiceId: p.id, date, amount });
		queued = await flush();
		offline = queued > 0;
		// clearing may move lastDone back — let the server recount
		if (!offline && amount < p.minDose) load();
	}

	function go(delta: number) {
		start = addDays(start, 7 * delta);
		week = undefined;
		load(start);
	}

	function toToday() {
		start = weekStart(today);
		week = undefined;
		load(start);
	}

	// Tap = norm, long press = choice. One touch for the daily mark.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let longPressed = false;
	function down(p: PracticeView, date: string) {
		if (reorder) return;
		longPressed = false;
		clearTimeout(timer);
		timer = setTimeout(() => {
			longPressed = true;
			navigator.vibrate?.(10);
			openSheet(p, date);
		}, 450);
	}
	function cancel() {
		clearTimeout(timer);
	}
	function tap(p: PracticeView, date: string) {
		clearTimeout(timer);
		if (longPressed) return;
		mark(p, date, p.normDose);
	}

	/** Spec 006: day note of a planned day; for a practice marked by checklist the mark follows the boxes. */
	async function saveDayNote(p: PracticeView, date: string, live: NoteDoc | null) {
		// notes shown on screen are reactive proxies; the queue (IndexedDB) needs a plain copy
		const doc = live ? ($state.snapshot(live) as NoteDoc) : null;
		const edit = { practiceId: p.id, date, note: doc, updatedAt: new Date().toISOString(), today };
		if (week?.plan) {
			const k = `${p.id}|${date}`;
			if (doc) week.plan.notes = { ...week.plan.notes, [k]: { note: doc, updatedAt: edit.updatedAt } };
			else {
				const { [k]: _, ...rest } = week.plan.notes;
				week.plan.notes = rest;
			}
			await cacheWeek($state.snapshot(week));
		}
		await enqueueDayNote(edit);
		const amount = p.checklistMarks && date <= today ? checklistAmount(doc, p) : null;
		if (amount !== null && amount !== (amountOf(p.id, date) ?? 0)) await mark(p, date, amount);
		else {
			queued = await flush();
			offline = queued > 0;
		}
	}

	async function saveNote(p: PracticeView, live: NoteDoc | null) {
		const doc = live ? ($state.snapshot(live) as NoteDoc) : null;
		const edit = { practiceId: p.id, note: doc, updatedAt: new Date().toISOString() };
		if (week) {
			const wp = week.practices.find((x) => x.id === p.id);
			if (wp) {
				wp.note = doc;
				wp.noteUpdatedAt = edit.updatedAt;
			}
			await cacheWeek($state.snapshot(week));
		}
		await enqueueNote(edit);
		queued = await flush();
		offline = queued > 0;
	}

	onMount(() => {
		const q = new URLSearchParams(location.search).get('tab');
		if (q === 'week' || q === 'all' || q === 'inbox') tab = q;
		load();
		inbox.init(today);
		const refresh = () => {
			const t = todayStr();
			if (t !== today) {
				const wasCurrent = start === weekStart(today);
				today = t;
				if (wasCurrent) start = weekStart(t);
			}
			flush().then((n) => (queued = n));
			load();
			inbox.load(today);
		};
		const onVis = () => document.visibilityState === 'visible' && refresh();
		document.addEventListener('visibilitychange', onVis);
		window.addEventListener('online', refresh);
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			window.removeEventListener('online', refresh);
		};
	});

	function cellStyle(color: string) {
		const c = colorOf(color);
		return `--c-light:${c.light};--c-dark:${c.dark}`;
	}
</script>

<main onpointerdown={tab === 'today' ? swipeStart : undefined} onpointerup={tab === 'today' ? swipeEnd : undefined}>
	{#if tab === 'today'}
		<TopBar help="today" onAdd={() => capture.show()}
			title={dayName(viewDay)}
			subtitle={[dayName(viewDay) !== dayTitle(viewDay) ? dayTitle(viewDay) : '', week && day.planned && !isFutureDay ? `по плану ${day.plannedDone} из ${day.planned}` : '']
				.filter(Boolean)
				.join(' · ')}
			below={dayNav}
			menu={[{ label: 'Изменить план', icon: Pencil, href: `/plan?start=${start}&from=today` }]}
		>
			{#snippet actions()}
				<button class="icon" class:on={reorder} aria-pressed={reorder} aria-label="Порядок карточек" title="Порядок" onclick={() => (reorder = !reorder)}><GripVertical size={22} /></button>
				<a class="icon" href="/settings?from=today" aria-label="Настройки" title="Настройки"><SettingsIcon size={22} /></a>
			{/snippet}
		</TopBar>
		{#if reorder}
			<div class="reorder-hint"><span>Перетаскивайте карточки за ≡</span><button onclick={() => (reorder = false)}>Готово</button></div>
		{/if}
	{:else if tab === 'week'}
		<TopBar help="week" onAdd={() => capture.show()}
			title="Неделя"
			subtitle="{label(days[0])} – {label(days[6])}"
			menu={[
				{ label: 'Шаблоны недели', icon: Layers, href: `/plan?start=${start}&from=week&templates=1` },
				{ label: 'Новая неделя с нуля', icon: CalendarPlus, href: `/plan?start=${start}&from=week&fresh=1` }
			]}
			below={weekNav}
		>
			{#snippet actions()}
				<a class="icon" href="/plan?start={start}&from=week" aria-label="Изменить план" title="Изменить план"><Pencil size={22} /></a>
				<a class="icon" href="/settings?from=week" aria-label="Настройки" title="Настройки"><SettingsIcon size={22} /></a>
			{/snippet}
		</TopBar>
	{:else if tab === 'all'}
		<TopBar help="all" onAdd={() => capture.show()} title="Всё" subtitle="{label(days[0])} – {label(days[6])}" below={weekNav}>
			{#snippet actions()}
				<button
					class="icon"
					aria-label={allLens === 'goal' ? 'Группировка по целям; переключить на форматы' : 'Группировка по форматам; переключить на цели'}
					title={allLens === 'goal' ? 'Цели' : 'Форматы'}
					onclick={() => setLens(allLens === 'goal' ? 'format' : 'goal')}
					>{#if allLens === 'goal'}<Target size={22} />{:else}<Shapes size={22} />{/if}</button
				>
				<a class="icon" href="/settings?from=all" aria-label="Настройки" title="Настройки"><SettingsIcon size={22} /></a>
			{/snippet}
		</TopBar>
		<p class="lens-label">{allLens === 'goal' ? 'По целям' : 'По форматам'}</p>
	{:else}
		<TopBar help="inbox" title="Входящие" subtitle={inbox.count ? `неразобранных: ${inbox.count}` : ''} onAdd={() => capture.show()} />
	{/if}

	{#if tab === 'inbox'}
		<InboxScreen {practices} {today} onChanged={() => load()} />
	{:else if offline && week}
		<p class="status">{problem ?? 'Нет связи'}{queued ? ` · не отправлено: ${queued}` : ''}</p>
	{/if}

	{#if tab === 'inbox'}
		<!-- Spec 008: the inbox has its own screen above -->
	{:else if !week}
		<div class="status">
			{#if problem}
				<p>{problem}</p>
				<button class="retry" onclick={() => load()}>Повторить</button>
			{:else}
				<p>Загрузка…</p>
			{/if}
		</div>
	{:else}
		{#if (isPlan || tab === 'today') && week.plan?.status === 'draft'}
			<div class="draft">
				<p>Черновик {sourceLabel(week.plan.source)}</p>
				<div>
					<button onclick={confirmDraft} disabled={confirming}>Утвердить</button>
					<a href="/plan?start={start}">Спланировать иначе</a>
				</div>
			</div>
		{:else if (isPlan || tab === 'today') && !week.plan}
			<div class="draft">
				<p>На эту неделю плана нет</p>
				{#if start >= weekStart(today)}<div><a href="/plan?start={start}">Спланировать</a></div>{/if}
			</div>
		{/if}
		{#if tab === 'today'}
			{@render todayScreen()}
		{:else}
		<div class="grid" style="--cols:{days.length}">
			<div></div>
			{#each days as d (d)}
				<div class="day" class:is-today={d === today}>
					<span>{DAY_NAMES[new Date(d + 'T12:00').getDay()]}</span>
					<b>{Number(d.slice(8))}</b>
				</div>
			{/each}

			{#each groups as g (g.key)}
				{#if g.practices.length === 1}
					{@const p = g.practices[0]}
					{@render practiceRow(p, g.title, p.title !== g.title ? p.title : '', false)}
				{:else}
					{@const isOpen = open.includes(g.key)}
					{@const n = groupDaysWithout(g, today, pausedOf)}
					<button class="name group" onclick={() => toggle(g.key)} aria-expanded={isOpen}>
						<svg class="chev" class:open={isOpen} viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.5 7 5 3.5 8.5" /></svg>
						<span class="gtext">
							<span>{g.title} <span class="count">{g.practices.length}</span></span>
							{@render goalSmall(lens !== 'format' ? g.practices[0].goalId : null, n >= 2 ? without(n) : '')}
						</span>
					</button>
					{#each days as d (d)}
						{@const c = groupCell(g, d, amountOf)}
						{@const planned = g.practices.some((p) => isPlanned(p.id, d))}
						<button
							class="cell"
							class:planned
							class:blank={isPlan && !planned}
							class:bonus={isPlan && !planned && c.done > 0}
							class:future={d > today}
							class:is-today={d === today}
							data-depth={c.depth}
							style={cellStyle(c.color)}
							disabled={d > today}
							aria-label="{g.title}, {label(d)}: {isOpen ? 'свернуть' : 'раскрыть'}"
							onclick={() => toggle(g.key)}
						>{#if c.done > 1}<span class="badge">{c.done}</span>{/if}</button>
					{/each}
					{#if isOpen}
						{#each g.practices as p (p.id)}
							{@render practiceRow(p, p.title, '', true)}
						{/each}
					{/if}
				{/if}
			{/each}

			<div class="name total">День</div>
			{#each days as d (d)}
				{@const sc = isPlan ? planDayScore(practices, d, isPlanned, amountOf) : dayScore(practices, d, amountOf)}
				<div class="total" class:future={d > today} aria-label="целей: {sc.done} из {sc.total}">
					{#if d <= today && sc.total}{sc.done}/{sc.total}{:else if d <= today}–{/if}
				</div>
			{/each}
		</div>

		{#if isPlan}
			<p class="week-sum">
				По плану {summary.done} из {summary.planned}{summary.bonus ? `, бонусов ${summary.bonus}` : ''}
			</p>
		{/if}

		{#if top && isCurrentWeek}
			<p class="priority">Сегодня в приоритете: <b>{top.title}</b></p>
		{/if}
		{/if}
	{/if}
</main>
<TabBar {tab} inboxCount={inbox.count} onselect={(t) => setTab(t)} />
<QuickCapture bind:this={capture} />
{#if flash}
	<div class="flash-wrap" aria-live="polite"><a class="flash" href="/settings/goal/{flash.goalId}?from={tab}">{flash.text}</a></div>
{/if}

{#snippet dayNav()}
	<div class="weeknav">
		<button class="icon" disabled={viewDay <= minDay} onclick={() => showDay(addDays(viewDay, -1))} aria-label="Предыдущий день"><ChevronLeft size={22} /></button>
		{#if viewDay !== today}<button class="link" onclick={() => showDay(today)}>Сегодня</button>{:else}<span></span>{/if}
		<button class="icon" disabled={viewDay >= maxDay} onclick={() => showDay(addDays(viewDay, 1))} aria-label="Следующий день"><ChevronRight size={22} /></button>
	</div>
{/snippet}

{#snippet weekNav()}
	<div class="weeknav">
		<button class="icon" onclick={() => go(-1)} aria-label="Прошлая неделя"><ChevronLeft size={22} /></button>
		{#if !isCurrentWeek}<button class="link" onclick={toToday}>к текущей неделе</button>{:else}<span></span>{/if}
		<button class="icon" onclick={() => go(1)} aria-label="Следующая неделя"><ChevronRight size={22} /></button>
	</div>
{/snippet}

{#if sheet && sheetPractice}
	{@const sp = sheetPractice}
	{@const sd = sheet.date}
	{@const dayMode = sheet.mode === 'day'}
	{@const planned = isPlanned(sp.id, sd)}
	{#key `${sp.id}|${sd}|${sheet.mode}`}
		<NoteSheet
			p={sp}
			dateLabel={sd === today ? 'сегодня' : label(sd)}
			amount={amountOf(sp.id, sd)}
			doc={dayMode ? dayNoteOf(sp.id, sd) : sp.note}
			head={dayMode ? { kind: 'day', label: dayTitle(sd), day: Number(sd.slice(8)) } : { kind: 'practice' }}
			showDose={!byChecklist(sp, sd) && sd <= today}
			switchLabel={dayMode ? 'Всегда' : planned ? dayTitle(sd) : undefined}
			onSwitch={planned ? () => (sheet = { pid: sp.id, date: sd, mode: dayMode ? 'practice' : 'day' }) : undefined}
			extraLabel={planned && sd > today ? 'Убрать из плана дня' : undefined}
			onExtra={planned && sd > today ? () => setPlanned(sp, false) : undefined}
			onDose={(a) => mark(sp, sd, a)}
			onNote={(doc) => (dayMode ? saveDayNote(sp, sd, doc) : saveNote(sp, doc))}
			onClose={() => (sheet = undefined)}
		/>
	{/key}
{/if}

{#snippet todayScreen()}
	{#if day.planned}
		{#if viewDay === today}
			<p class="priority today-top">
				{#if day.top}В приоритете: <b>{day.top}</b>{:else}План на сегодня выполнен{/if}
			</p>
		{:else if isFutureDay}
			<p class="day-hint">Отмечать можно, когда день наступит. Заметку дня можно писать уже сейчас.</p>
		{/if}
	{:else}
		<p class="empty-day">На {viewDay === today ? 'сегодня' : 'этот день'} ничего не запланировано</p>
	{/if}

	{#if day.todo.length}
		<h2 class="zone">К выполнению</h2>
		<ul class="cards" class:reorder bind:this={listEls.todo}>
			{#each inOrder('todo', day.todo, (p) => p.id) as p (p.id)}
				<li data-id={p.id} class:dragging={drag?.id === p.id} in:receive={{ key: p.id }} out:send={{ key: p.id }} animate:flip={{ duration: 180 }}>
					{@render card(p, false, 'todo', day.todo.map((x) => x.id))}
				</li>
			{/each}
		</ul>
	{/if}

	{#if day.done.length}
		<h2 class="zone">Сделано</h2>
		<ul class="cards" class:reorder bind:this={listEls.done}>
			{#each inOrder('done', day.done, (d) => d.p.id) as d (d.p.id)}
				<li data-id={d.p.id} class:dragging={drag?.id === d.p.id} in:receive={{ key: d.p.id }} out:send={{ key: d.p.id }} animate:flip={{ duration: 180 }}>
					{@render card(d.p, d.bonus, 'done', day.done.map((x) => x.p.id))}
				</li>
			{/each}
		</ul>
	{/if}

	{#if isFutureDay && day.other.length}
		<details class="more" open={!day.planned}>
			<summary>Добавить в план этого дня <span class="count">{day.other.length}</span></summary>
			<ul class="addlist">
				{#each day.other as p (p.id)}
					<li><button onclick={() => setPlanned(p, true)}>+ {p.title}{#if p.goalTitle !== p.title}<small>{p.goalTitle}</small>{/if}</button></li>
				{/each}
			</ul>
		</details>
	{:else if day.other.length}
		<details class="more" open={moreOpen || !day.planned} ontoggle={(e) => (moreOpen = (e.currentTarget as HTMLDetailsElement).open)}>
			<summary>Сделать что-то ещё <span class="count">{otherCount(day.other)}</span></summary>
			<!-- #12: recommended on top as a flat list (they can be reordered); the rest as the settings tree -->
			{#if recommended.length}
				<h3 class="sub-title">Рекомендованные</h3>
				<ul class="cards" class:reorder bind:this={listEls.other}>
					{#each inOrder('other', recommended, (p) => p.id) as p (p.id)}
						<li data-id={p.id} class:dragging={drag?.id === p.id} in:receive={{ key: p.id }} out:send={{ key: p.id }} animate:flip={{ duration: 180 }}>
							{@render card(p, false, 'other', recommended.map((x) => x.id))}
						</li>
					{/each}
				</ul>
			{/if}
			{#if otherTree.length}
				<div class="other-tree">
					<Tree tree={otherTree} storageKey="today-tree-collapsed">
						{#snippet practice(p)}
							{@render card(p, false, 'tree', [])}
						{/snippet}
					</Tree>
				</div>
			{/if}
		</details>
	{/if}

{/snippet}

{#snippet card(p: PracticeView, bonus: boolean, list: ListName, ids: number[])}
	{@const planned = isPlanned(p.id, viewDay)}
	{@const dayNote = planned ? dayNoteOf(p.id, viewDay) : null}
	{@const a = amountOf(p.id, viewDay)}
	{@const dep = depth(a, p)}
	{@const auto = byChecklist(p, viewDay)}
	{@const st = checklistStats(dayNote)}
	{@const isOpen = expanded === p.id}
	{@const showDay = !!dayNote && (p.showNoteFull || isOpen)}
	{@const first = showDay || isOpen ? null : firstLine(dayNote) ? firstBlockDoc(dayNote) : firstBlockDoc(p.note)}
	<div class="card-wrap" data-depth={dep}>
		<!-- Spec 007 F: the box is the only mark; a tap anywhere else opens the card in place.
		     Keyboard and screen readers use the header button (.chead); the click on the whole card
		     only widens the touch target. -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
		<div
			class="card"
			class:nobox={auto}
			class:has-star={list === 'other' || list === 'tree'}
			class:open={isOpen}
			data-depth={dep}
			style={cellStyle(p.color)}
			role="group"
			aria-label={p.title}
			onclick={() => toggleCard(p.id)}
		>
			{#if !auto}
				<button
					class="box box-btn"
					disabled={isFutureDay}
					aria-pressed={counts(a, p)}
					aria-label="{p.title}: {counts(a, p) ? 'снять отметку' : 'отметить норму'}"
					onclick={(e) => {
						e.stopPropagation();
						mark(p, viewDay, counts(a, p) ? 0 : p.normDose);
					}}>{#if counts(a, p)}<svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6 9.6 3.4" /></svg>{/if}</button
				>
			{/if}
			<div class="chead-col">
			<button
				class="chead"
				aria-expanded={isOpen}
				aria-label="{p.title}{bonus ? ', бонус' : ''}: {isOpen ? 'свернуть' : 'раскрыть'}"
				onclick={(e) => {
					e.stopPropagation();
					toggleCard(p.id);
				}}
			>
				<span class="ctitle">{p.title}{#if bonus}<span class="tag">бонус</span>{/if}</span>
			</button>
			{@render mline(p.goalId, p.goalTitle !== p.title && list !== 'tree' ? p.goalTitle : '')}
			</div>
			{#if list === 'other' || list === 'tree'}{@render star(p)}{/if}
			<span class="dose" class:count={auto}
				>{auto ? `${st.checked} из ${st.total}` : a && !counts(a, p) ? `${a} из ${p.normDose} ${p.unit}` : a ? `${a} ${p.unit}` : doseHint(p)}</span
			>
			{#if first}
				<!-- task 13: the note's first block, whole and formatted; links work, the rest of a tap opens the card -->
				<div class="cnote cline"><NoteView doc={first} preview /></div>
			{/if}
			{#if showDay && dayNote}
				<div class="cnote">
					<NoteHead kind="day" label={dayTitle(viewDay)} day={Number(viewDay.slice(8))} />
					<NoteView doc={dayNote} readonly={isFutureDay} onToggle={(i) => saveDayNote(p, viewDay, toggleTask(dayNote, i))} onOpen={() => {}} />
				</div>
			{/if}
			{#if isOpen}
				<div class="cnote cexpand" role="presentation" onclick={(e) => e.stopPropagation()}>
					{#if p.note}
						<NoteHead kind="practice" />
						<NoteView doc={p.note} onToggle={(i) => saveNote(p, toggleTask(p.note!, i))} onOpen={() => toggleCard(p.id)} />
					{/if}
					{#if !auto && !isFutureDay}
						<div class="dose-row">
							<button onclick={() => mark(p, viewDay, p.minDose)}>Мин · {p.minDose}</button>
							<button onclick={() => mark(p, viewDay, p.normDose)}>Норма · {p.normDose}</button>
						</div>
						{#if qtyOpen === p.id}
							<form
								class="qty"
								onsubmit={(e) => {
									e.preventDefault();
									const v = Number(String(new FormData(e.currentTarget).get('q') ?? '').replace(',', '.'));
									if (Number.isFinite(v) && v >= 0) {
										mark(p, viewDay, v);
										qtyOpen = undefined;
									}
								}}
							>
								<!-- svelte-ignore a11y_autofocus -->
								<input name="q" inputmode="decimal" placeholder="Количество, {p.unit}" aria-label="Количество, {p.unit}" value={a ?? ''} autofocus />
								<button type="submit" aria-label="Записать количество">✓</button>
							</form>
						{/if}
					{/if}
					<!-- task 13: one row of icons; new actions are added here as more buttons -->
					<div class="actions" role="toolbar" aria-label="{p.title}: действия">
						<button
							class:dim={!p.note}
							aria-label="Заметка «Всегда»: {p.note ? 'изменить' : 'создать'}"
							title="Заметка «Всегда»"
							onclick={() => openSheet(p, viewDay, 'practice')}><FilePen size={22} /></button
						>
						{#if planned}
							<button
								class:dim={!dayNote}
								aria-label="Заметка дня, {dayTitle(viewDay)}: {dayNote ? 'изменить' : 'создать'}"
								title="Заметка дня, {dayTitle(viewDay)}"
								onclick={() => openSheet(p, viewDay, 'day')}><DayIcon day={Number(viewDay.slice(8))} /></button
							>
						{/if}
						{@render star(p)}
						<a
							class="flag-btn"
							class:dim={!week?.milestones?.[p.goalId]}
							href="/settings/goal/{p.goalId}?from={tab}"
							aria-label="Цель «{p.goalTitle}»: майлстон и прогресс"
							title="Майлстон"><Flag size={22} /></a
						>
						{#if !auto && !isFutureDay}
							<button
								class="qty-btn"
								class:on={qtyOpen === p.id}
								aria-label="Своё количество, {p.unit}"
								aria-expanded={qtyOpen === p.id}
								title="Своё количество"
								onclick={() => (qtyOpen = qtyOpen === p.id ? undefined : p.id)}>±</button
							>
						{/if}
					</div>
				</div>
			{/if}
		</div>
		{@render sideButton(p, list, ids, `${p.title}: ${planned ? 'план дня и заметка' : 'доза и заметка'}`, () => openSheet(p, viewDay))}
	</div>
{/snippet}

{#snippet mline(goalId: number, goalTitle: string)}
	<!-- Spec 009 B: «goal · flag time left» under the title; a tap opens the goal screen, not the card -->
	{@const m = week?.milestones?.[goalId]}
	<a class="mline" href="/settings/goal/{goalId}?from={tab}" onclick={(e) => e.stopPropagation()}
		>{#if goalTitle}<span class="mgoal">{goalTitle}</span>{/if}{#if m}{#if goalTitle}<span class="sep">·</span>{/if}<Flag size={11} /><span
				>{remaining(m.dueDate, today) || 'без срока'}</span
			>{:else}{#if goalTitle}<span class="sep">·</span>{/if}<span class="none">нет майлстона</span>{/if}</a
	>
{/snippet}

{#snippet goalSmall(goalId: number | null, text: string)}
	<!-- Spec 009 B: the same milestone line in goal headings of «Неделя» and «Всё» -->
	{@const m = goalId === null ? undefined : week?.milestones?.[goalId]}
	{#if text || m}
		<small class="gsmall">{text}{#if m}{#if text}<span> · </span>{/if}<Flag size={10} />{remaining(m.dueDate, today) || 'без срока'}{/if}</small>
	{/if}
{/snippet}

{#snippet star(p: PracticeView)}
	<button
		class="star"
		class:on={p.recommended}
		aria-pressed={p.recommended}
		aria-label="{p.title}: {p.recommended ? 'не рекомендовать' : 'рекомендовать'}"
		title={p.recommended ? 'Рекомендовано' : 'Рекомендовать'}
		onclick={(e) => {
			e.stopPropagation();
			toggleRecommended(p);
		}}><Star size={20} fill={p.recommended ? 'currentColor' : 'none'} /></button
	>
{/snippet}

{#snippet sideButton(p: PracticeView, list: ListName, ids: number[], label: string, open: () => void)}
	{#if reorder && list !== 'tree'}
		<button
			class="more-btn handle"
			aria-label="{p.title}: перетащить"
			onpointerdown={(e) => dragStart(e, list, p.id, ids)}
			onpointermove={dragMove}
			onpointerup={dragEnd}
			onpointercancel={dragEnd}><GripVertical size={22} /></button
		>
	{:else}
		<button class="more-btn" aria-label={label} title="Заметка и доза" onclick={open}><Ellipsis size={20} /></button>
	{/if}
{/snippet}

{#snippet practiceRow(p: PracticeView, title: string, sub: string, indent: boolean)}
	{@const n = nOf(p)}
	<button class="name pname" class:indent onclick={() => openSheet(p, today)} aria-label="{p.title}: доза и заметка">
		<span>{title}</span>
		{@render goalSmall(lens !== 'format' && !indent ? p.goalId : null, [sub, n >= 2 ? without(n) : ''].filter(Boolean).join(' · '))}
	</button>
	{#each days as d (d)}
		{@const a = amountOf(p.id, d)}
		{@const planned = isPlanned(p.id, d)}
		<button
			class="cell"
			class:planned
			class:blank={isPlan && !planned}
			class:bonus={isPlan && !planned && counts(a, p)}
			class:future={d > today}
			class:is-today={d === today}
			data-depth={depth(a, p)}
			style={cellStyle(p.color)}
			disabled={d > today}
			aria-label="{p.title}, {label(d)}: {a ? `${a} ${p.unit}` : 'нет'}"
			onpointerdown={() => down(p, d)}
			onpointerup={() => tap(p, d)}
			onpointerleave={cancel}
			onpointercancel={cancel}
			oncontextmenu={(e) => e.preventDefault()}
		></button>
	{/each}
{/snippet}

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 12px calc(env(safe-area-inset-bottom) + 84px);
	}
	.retry {
		min-height: 44px;
		padding: 0 20px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		cursor: pointer;
	}
	.status {
		text-align: center;
		color: var(--muted);
		font-size: 13px;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(118px, 2.1fr) repeat(var(--cols), minmax(0, 1fr));
		gap: 6px;
		align-items: center;
	}
	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: 12px;
		color: var(--muted);
		padding: 4px 0;
		border-radius: 8px;
	}
	.day b {
		font-size: 15px;
		color: var(--text);
	}
	.day.is-today {
		background: var(--today);
		color: var(--bg);
	}
	.day.is-today b {
		color: var(--bg);
	}
	.name {
		display: flex;
		flex-direction: column;
		font-size: 14px;
		line-height: 1.2;
		hyphens: auto;
		-webkit-hyphens: auto;
	}
	.name small {
		color: var(--muted);
		font-size: 12px;
	}
	.cell {
		--c: var(--c-light);
		aspect-ratio: 1;
		width: 100%;
		border-radius: 8px;
		border: 1.5px dashed var(--line);
		background: transparent;
		padding: 0;
		cursor: pointer;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		transition: background-color 0.12s;
	}
	@media (prefers-color-scheme: dark) {
		.cell {
			--c: var(--c-dark);
		}
	}
	.cell.is-today {
		border-color: var(--muted);
	}
	.cell[data-depth='0.5'] {
		border: 1.5px solid transparent;
		background: color-mix(in oklab, var(--c) var(--half), var(--surface));
	}
	.cell[data-depth='1'] {
		border: 1.5px solid transparent;
		background: var(--c);
	}
	/* Above norm: deepest shade, plus a dot so it reads the same in both themes. */
	.cell[data-depth='1.5'] {
		border: 1.5px solid transparent;
		background:
			radial-gradient(circle, var(--surface) 0 3px, transparent 3.5px),
			color-mix(in oklab, var(--c), var(--plus-mix));
	}
	.cell.future {
		border: 1.5px solid transparent;
		background: color-mix(in oklab, var(--line) 35%, transparent);
		cursor: default;
	}
	.total {
		text-align: center;
		font-size: 12px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.name.total {
		text-align: left;
		font-size: 14px;
	}
	.priority {
		margin-top: 20px;
		padding: 12px 14px;
		background: var(--surface);
		border-radius: 12px;
		font-size: 15px;
	}
	button.name {
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font: inherit;
		font-size: 14px;
		min-height: 44px;
		justify-content: center;
	}
	button.name.group {
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 4px;
		width: 100%;
		min-width: 0;
		color: var(--text);
	}
	.gtext {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.gtext small {
		color: var(--muted);
		font-size: 12px;
	}
	.chev {
		flex: none;
		width: 10px;
		height: 10px;
		fill: none;
		stroke: var(--muted);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		transform-origin: 50% 50%;
		transition: transform 0.15s;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.count {
		color: var(--muted);
		font-size: 12px;
	}
	.name.indent {
		padding-left: 14px;
		font-size: 13px;
	}
	.cell {
		position: relative;
	}
	.badge {
		position: absolute;
		top: 2px;
		right: 3px;
		font-size: 10px;
		font-weight: 700;
		line-height: 1;
		color: var(--surface);
		font-variant-numeric: tabular-nums;
	}
	.cell[data-depth='0.5'] .badge {
		color: var(--text);
	}
	/* Spec 003: outline = plan, fill = fact; no plan in the plan view = empty space. */
	.cell.planned {
		border: 2px solid var(--c);
	}
	.cell.blank[data-depth='0'] {
		border-color: transparent;
		background: transparent;
	}
	.cell.blank.future {
		background: transparent;
	}
	.cell.bonus::after {
		content: '+';
		position: absolute;
		top: 1px;
		left: 4px;
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		color: var(--surface);
	}
	.cell.bonus[data-depth='0.5']::after {
		color: var(--text);
	}
	.draft {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
		margin: 0 0 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--surface);
		font-size: 14px;
	}
	.draft p {
		margin: 0;
	}
	.draft div {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.draft button,
	.draft a {
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		padding: 0 12px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		text-decoration: none;
		font-size: 14px;
		cursor: pointer;
	}
	.week-sum {
		margin: 12px 0 0;
		font-size: 13px;
		color: var(--muted);
		text-align: center;
	}
	.dose.count {
		white-space: nowrap;
		font-size: 14px;
		font-weight: 600;
	}
	main {
		touch-action: pan-y;
	}
	.day-hint {
		color: var(--muted);
		font-size: 14px;
		margin: 0 0 8px;
	}
	.addlist {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.addlist button {
		width: 100%;
		min-height: 48px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		border: 1px dashed var(--line);
		border-radius: 12px;
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.addlist small {
		color: var(--muted);
		margin-left: auto;
	}
	.today-top {
		margin-top: 0;
	}
	.empty-day {
		text-align: center;
		color: var(--muted);
		margin: 24px 0 8px;
	}
	.zone {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 20px 0 8px;
	}
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	/* header row: box · title · dose (· room for ⋯); the note runs full width below (#9) */
	.card {
		--c: var(--c-light);
		--fg: var(--text);
		width: 100%;
		box-sizing: border-box;
		min-height: 60px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(0, 36%);
		align-items: center;
		column-gap: 12px;
		padding: 10px 14px;
		border-radius: 14px;
		border: 2px solid var(--c);
		background: var(--surface);
		color: var(--fg);
		text-align: left;
		cursor: pointer;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		transition: background-color 0.15s;
	}
	@media (prefers-color-scheme: dark) {
		.card {
			--c: var(--c-dark);
		}
	}
	/* done: fill by depth (v0.1 rules); white text on the full shades */
	.card[data-depth='0.5'] {
		background: color-mix(in oklab, var(--c) var(--half), var(--surface));
	}
	/* full shades use the deeper palette tone in both themes, so white text stays readable */
	.card[data-depth='1'] {
		background: color-mix(in oklab, var(--c-light) 78%, black);
		border-color: transparent;
		--fg: #fff;
	}
	.card[data-depth='1.5'] {
		background: color-mix(in oklab, var(--c-light) 58%, black);
		border-color: transparent;
		--fg: #fff;
	}
	.box {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		border: 2px solid var(--c);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.card[data-depth='1'] .box,
	.card[data-depth='1.5'] .box {
		border-color: #fff;
	}
	.box svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: var(--fg);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ctitle {
		font-size: 16px;
		font-weight: 600;
	}
	.gsmall {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		flex-wrap: wrap;
	}
	/* Spec 009 C: does not block — the next mark is still a tap away */
	.flash {
		position: fixed;
		left: 50%;
		bottom: calc(env(safe-area-inset-bottom) + 72px);
		transform: translateX(-50%);
		z-index: 9;
		max-width: calc(100% - 32px);
		box-sizing: border-box;
		padding: 9px 16px;
		border-radius: 14px;
		background: var(--text);
		color: var(--bg);
		font-size: 14px;
		text-decoration: none;
		text-align: center;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.2);
		animation: flash-in 0.18s ease-out;
	}
	@keyframes flash-in {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
	}
	.chead-col {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
	}
	/* Spec 009 B: quiet goal line; it must not make the card taller */
	.mline {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		max-width: 100%;
		font-size: 13px;
		line-height: 1.2;
		opacity: 0.75;
		color: inherit;
		text-decoration: none;
		white-space: nowrap;
	}
	.mline .mgoal {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mline .sep {
		margin: 0 1px;
	}
	.mline :global(svg) {
		flex: none;
	}
	.mline .none {
		opacity: 0.75;
	}
	.tag {
		margin-left: 8px;
		padding: 1px 6px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		border: 1px solid currentColor;
		vertical-align: 2px;
	}
	.dose {
		flex: none;
		max-width: 40%;
		text-align: right;
		font-size: 12px;
		opacity: 0.8;
	}
	.more {
		margin-top: 20px;
	}
	.more summary {
		font-size: 15px;
		color: var(--muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}
	.card-wrap {
		position: relative;
	}
	/* Spec 006: a day card is not one big button — the box marks, the text opens the day note */
	.more-btn.handle {
		touch-action: none;
		font-size: 22px;
		cursor: grab;
	}
	.cards.reorder .card {
		pointer-events: none;
	}
	.cards.reorder .card-wrap {
		user-select: none;
		-webkit-user-select: none;
	}
	li.dragging .card {
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.25);
		transform: scale(1.02);
	}
	.card {
		cursor: pointer;
	}
	.chead {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.box-btn {
		position: relative;
	}
	/* the box's touch area is 44 pt even though it looks smaller */
	.box-btn::before {
		content: '';
		position: absolute;
		inset: -10px;
	}
	.box-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.cexpand {
		display: flex;
		flex-direction: column;
		gap: 10px;
		cursor: default;
	}
	/* task 13: minimum and norm stay as short chips; «±» opens the quantity field */
	.dose-row {
		display: flex;
		gap: 8px;
	}
	.dose-row button,
	.qty input,
	.qty button {
		min-height: 44px;
		border-radius: 22px;
		border: 1px solid color-mix(in oklab, var(--fg) 30%, transparent);
		background: color-mix(in oklab, var(--surface) 70%, transparent);
		color: var(--text);
		font: inherit;
		font-size: 15px;
		cursor: pointer;
	}
	.dose-row button {
		padding: 0 16px;
	}
	.qty {
		display: flex;
		gap: 6px;
	}
	.qty input {
		flex: 1;
		min-width: 0;
		border-radius: 10px;
		padding: 0 10px;
		font-size: 17px;
		cursor: text;
	}
	.qty button {
		width: 48px;
		border-radius: 10px;
	}
	/* task 13: the icon row, 44 pt targets; a note that does not exist yet is dimmed */
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 0 -6px -4px;
	}
	.actions button,
	.actions .flag-btn {
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--fg);
		font: inherit;
		cursor: pointer;
	}
	.actions .flag-btn.dim,
	.actions button.dim {
		opacity: 0.4;
	}
	.actions .qty-btn {
		font-size: 22px;
		font-weight: 600;
	}
	.actions .qty-btn.on {
		background: color-mix(in oklab, var(--fg) 14%, transparent);
	}
	.box-btn {
		padding: 0;
		background: none;
		cursor: pointer;
		color: var(--fg);
		margin-top: 2px;
	}
	.card .dose {
		margin-right: 34px;
	}
	.card.nobox {
		grid-template-columns: minmax(0, 1fr) minmax(0, 36%);
	}
	.card .dose {
		max-width: none;
		justify-self: end;
	}
	.cnote {
		grid-column: 1 / -1;
		min-width: 0;
		margin-top: 6px;
	}
	.cline.cnote {
		display: block;
	}
	/* task 12: the star, a 44 pt target */
	.card.has-star {
		grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 32%);
	}
	.star {
		width: 44px;
		height: 44px;
		margin: -10px -6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.star.on {
		color: #e0a400;
	}
	.actions .star {
		margin: 0;
	}
	.actions .star:not(.on) {
		color: var(--fg);
	}
	/* #12: the sections of «Сделать что-то ещё» */
	.sub-title {
		margin: 14px 0 6px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.other-tree :global(h2) {
		margin-top: 16px;
	}
	.more-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: absolute;
		top: 8px;
		right: 6px;
		width: 40px;
		height: 44px;
		border: none;
		background: none;
		border-radius: 10px;
		font-size: 20px;
		line-height: 1;
		color: var(--muted);
		cursor: pointer;
	}
	.card-wrap[data-depth='1'] .more-btn,
	.card-wrap[data-depth='1.5'] .more-btn {
		color: #fff;
	}
	/* task 11: links on cards — the link colour, underlined; on a filled card (white text) the text
	   colour with a thicker underline, so they stay readable on any practice colour */
	.cnote :global(a) {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.card[data-depth='1'] :global(a),
	.card[data-depth='1.5'] :global(a) {
		color: inherit;
		text-decoration-thickness: 2px;
		font-weight: 600;
	}
	/* task 13: the first block wraps to the card's width, nothing is cut */
	.cline {
		opacity: 0.9;
		margin-top: 2px;
		overflow-wrap: anywhere;
	}
	.cline :global(.note-view) {
		font-size: 13px;
		line-height: 1.35;
	}
	.cline :global(ul) {
		margin: 0;
	}
	button.pname {
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		font: inherit;
		font-size: 14px;
		color: var(--text);
		cursor: pointer;
		min-height: 36px;
		justify-content: center;
	}
	.weeknav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: -4px -8px 8px;
	}
	.weeknav .icon {
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--text);
		cursor: pointer;
	}
	.weeknav .link {
		border: none;
		background: none;
		color: var(--muted);
		font-size: 14px;
		min-height: 44px;
		cursor: pointer;
	}
	.lens-label {
		margin: -4px 0 8px;
		font-size: 13px;
		color: var(--muted);
	}
	.reorder-hint {
		position: sticky;
		top: calc(env(safe-area-inset-top) + 50px);
		z-index: 4;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin: 0 0 10px;
		padding: 6px 6px 6px 12px;
		border-radius: 12px;
		background: var(--text);
		color: var(--bg);
		font-size: 14px;
	}
	.reorder-hint button {
		min-height: 36px;
		padding: 0 14px;
		border: none;
		border-radius: 9px;
		background: var(--bg);
		color: var(--text);
		font-weight: 600;
		cursor: pointer;
	}
</style>
