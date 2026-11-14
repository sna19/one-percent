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
	import NoteView from '#lib/NoteView.svelte';
	import { checklistAmount, checklistStats, firstLine, toggleTask, type NoteDoc } from '#lib/note.js';
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
	type Tab = 'today' | 'week' | 'all';
	type View = 'plan' | Lens;
	let tab = $state<Tab>('today');
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
	const day = $derived(todayLists(practices, viewDay, isPlanned, amountOf));
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

	// «Порядок» (#9): drag cards by their ≡ handle; the order is the practices' order everywhere.
	type ListName = 'todo' | 'done' | 'other';
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

	const nOf = (p: PracticeView) => daysWithout(p.lastDone, p.createdOn, today);
	// Priority is chosen among goals; in the plan view only among goals planned for today.
	const top = $derived(
		priority(
			groupPractices(practices, 'goal')
				.filter((g) => !isPlan || g.practices.some((p) => isPlanned(p.id, today)))
				.map((g, i) => ({
					id: i,
					title: g.title,
					n: groupDaysWithout(g, today),
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

	async function mark(p: PracticeView, date: string, amount: number) {
		if (!week || date > today) return;
		apply(week, p.id, date, amount);
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
		if (q === 'week' || q === 'all') tab = q;
		load();
		const refresh = () => {
			const t = todayStr();
			if (t !== today) {
				const wasCurrent = start === weekStart(today);
				today = t;
				if (wasCurrent) start = weekStart(t);
			}
			flush().then((n) => (queued = n));
			load();
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
		<TopBar
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
		<TopBar
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
	{:else}
		<TopBar title="Всё" subtitle="{label(days[0])} – {label(days[6])}" below={weekNav}>
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
	{/if}

	{#if offline && week}
		<p class="status">{problem ?? 'Нет связи'}{queued ? ` · не отправлено: ${queued}` : ''}</p>
	{/if}

	{#if !week}
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
					{@const n = groupDaysWithout(g, today)}
					<button class="name group" onclick={() => toggle(g.key)} aria-expanded={isOpen}>
						<svg class="chev" class:open={isOpen} viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.5 7 5 3.5 8.5" /></svg>
						<span class="gtext">
							<span>{g.title} <span class="count">{g.practices.length}</span></span>
							{#if n >= 2}<small>{without(n)}</small>{/if}
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
<TabBar {tab} onselect={(t) => setTab(t)} />

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
			noteTitle={dayMode ? 'План дня' : planned ? 'Общая заметка практики' : undefined}
			showDose={!byChecklist(sp, sd) && sd <= today}
			switchLabel={dayMode ? 'Общая заметка практики' : planned ? 'План дня' : undefined}
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
			<summary>Сделать что-то ещё <span class="count">{day.other.length}</span></summary>
			<ul class="cards" class:reorder bind:this={listEls.other}>
				{#each inOrder('other', day.other, (p) => p.id) as p (p.id)}
					<li data-id={p.id} class:dragging={drag?.id === p.id} in:receive={{ key: p.id }} out:send={{ key: p.id }} animate:flip={{ duration: 180 }}>
						{@render card(p, false, 'other', day.other.map((x) => x.id))}
					</li>
				{/each}
			</ul>
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
	{@const line = showDay || isOpen ? '' : firstLine(dayNote) || firstLine(p.note)}
	<div class="card-wrap" data-depth={dep}>
		<!-- Spec 007 F: the box is the only mark; a tap anywhere else opens the card in place.
		     Keyboard and screen readers use the header button (.chead); the click on the whole card
		     only widens the touch target. -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
		<div
			class="card"
			class:nobox={auto}
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
				{#if p.goalTitle !== p.title}<small>{p.goalTitle}</small>{/if}
			</button>
			<span class="dose" class:count={auto}
				>{auto ? `${st.checked} из ${st.total}` : a && !counts(a, p) ? `${a} из ${p.normDose} ${p.unit}` : a ? `${a} ${p.unit}` : doseHint(p)}</span
			>
			{#if line}<span class="cnote cline">→ {line}</span>{/if}
			{#if showDay && dayNote}
				<div class="cnote">
					<span class="plan-title">План дня</span>
					<NoteView doc={dayNote} readonly={isFutureDay} onToggle={(i) => saveDayNote(p, viewDay, toggleTask(dayNote, i))} onOpen={() => {}} />
				</div>
			{/if}
			{#if isOpen}
				<div class="cnote cexpand" role="presentation" onclick={(e) => e.stopPropagation()}>
					{#if p.note}
						<span class="plan-title">Заметка практики</span>
						<NoteView doc={p.note} onToggle={(i) => saveNote(p, toggleTask(p.note!, i))} onOpen={() => toggleCard(p.id)} />
					{/if}
					{#if !auto && !isFutureDay}
						<div class="dose-row">
							<button onclick={() => mark(p, viewDay, p.minDose)}>Минимум · {p.minDose}</button>
							<button onclick={() => mark(p, viewDay, p.normDose)}>Норма · {p.normDose}</button>
							<form
								onsubmit={(e) => {
									e.preventDefault();
									const v = Number(String(new FormData(e.currentTarget).get('q') ?? '').replace(',', '.'));
									if (Number.isFinite(v) && v >= 0) mark(p, viewDay, v);
								}}
							>
								<input name="q" inputmode="decimal" placeholder="Количество, {p.unit}" aria-label="Количество, {p.unit}" value={a ?? ''} />
								<button type="submit" aria-label="Записать количество">✓</button>
							</form>
						</div>
					{/if}
					<div class="links">
						<button onclick={() => openSheet(p, viewDay, 'practice')}>Изменить заметку</button>
						{#if planned}<button onclick={() => openSheet(p, viewDay, 'day')}>Изменить заметку дня</button>{/if}
					</div>
				</div>
			{/if}
		</div>
		{@render sideButton(p, list, ids, `${p.title}: ${planned ? 'план дня и заметка' : 'доза и заметка'}`, () => openSheet(p, viewDay))}
	</div>
{/snippet}

{#snippet sideButton(p: PracticeView, list: ListName, ids: number[], label: string, open: () => void)}
	{#if reorder}
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
		{#if sub || n >= 2}<small>{[sub, n >= 2 ? without(n) : ''].filter(Boolean).join(' · ')}</small>{/if}
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
	.chead small {
		font-size: 13px;
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
	.dose-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.dose-row form {
		grid-column: 1 / -1;
		display: flex;
		gap: 6px;
	}
	.dose-row button,
	.dose-row input,
	.links button {
		min-height: 44px;
		border-radius: 10px;
		border: 1px solid color-mix(in oklab, var(--fg) 30%, transparent);
		background: color-mix(in oklab, var(--surface) 70%, transparent);
		color: var(--text);
		font: inherit;
		font-size: 15px;
		cursor: pointer;
	}
	.dose-row input {
		flex: 1;
		min-width: 0;
		padding: 0 10px;
		font-size: 17px;
		cursor: text;
	}
	.dose-row form button {
		width: 48px;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.links button {
		padding: 0 12px;
		background: none;
		color: var(--fg);
	}
	.box-btn {
		padding: 0;
		background: none;
		cursor: pointer;
		color: var(--fg);
		margin-top: 2px;
	}
	.plan-title {
		margin-top: 6px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.75;
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
	.cline {
		font-size: 13px;
		opacity: 0.9;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 2px;
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
