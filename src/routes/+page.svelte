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
	import { cacheWeek, cachedWeek, enqueue, enqueueNote, flush, pending, pendingNotes } from '#lib/store.js';
	import { dayTitle, doseHint, todayLists } from '#lib/today.js';
	import { crossfade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import NoteSheet from '#lib/NoteSheet.svelte';
	import { firstLine, type NoteDoc } from '#lib/note.js';
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
	let sheet = $state<{ pid: number; date: string } | undefined>();
	const sheetPractice = $derived(sheet ? week?.practices.find((x) => x.id === sheet!.pid) : undefined);
	function openSheet(p: PracticeView, date: string) {
		clearTimeout(timer);
		sheet = { pid: p.id, date };
	}

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
		// the day screen is always about today
		if (t === 'today' && start !== weekStart(today)) toToday();
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
	const day = $derived(todayLists(practices, today, isPlanned, amountOf));
	let moreOpen = $state(false);
	const [send, receive] = crossfade({ duration: 220 });

	// Card: tap = norm, tap again = clear; long press = the same choice as on a cell.
	function cardUp(p: PracticeView) {
		clearTimeout(timer);
		if (longPressed) return;
		mark(p, today, counts(amountOf(p.id, today), p) ? 0 : p.normDose);
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
		(src.startsWith('template:') ? 'по шаблону' : src.startsWith('week:') ? `по неделе с ${label(src.slice(5))}` : '');

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

	async function saveNote(p: PracticeView, doc: NoteDoc | null) {
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

<main>
	{#if tab === 'today'}
	<header class="today-head">
		<h1>{dayTitle(today)}</h1>
		{#if week && day.planned}<span>по плану {day.plannedDone} из {day.planned}</span>{/if}
	</header>
	{:else}
	<header>
		<button class="nav" onclick={() => go(-1)} aria-label="Прошлая неделя">‹</button>
		<div class="range">
			<span>{label(days[0])} – {label(days[6])}</span>
			{#if !isCurrentWeek}
				<button class="link" onclick={toToday}>к сегодня</button>
			{/if}
		</div>
		<button class="nav" onclick={() => go(1)} aria-label="Следующая неделя">›</button>
	</header>
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
		<div class="lens" role="tablist" aria-label="Вкладки">
			<button role="tab" aria-selected={tab === 'today'} class:on={tab === 'today'} onclick={() => setTab('today')}>Сегодня</button>
			<button role="tab" aria-selected={tab === 'week'} class:on={tab === 'week'} onclick={() => setTab('week')}>Неделя</button>
			<button role="tab" aria-selected={tab === 'all'} class:on={tab === 'all'} onclick={() => setTab('all')}>Всё</button>
		</div>
		{#if tab === 'all'}
			<div class="sublens" role="radiogroup" aria-label="Группировка">
				<button role="radio" aria-checked={allLens === 'goal'} class:on={allLens === 'goal'} onclick={() => setLens('goal')}>По целям</button>
				<button role="radio" aria-checked={allLens === 'format'} class:on={allLens === 'format'} onclick={() => setLens('format')}>По формату</button>
			</div>
		{/if}
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
				{#if week.plan && start >= weekStart(today)}· <a href="/plan?start={start}">Изменить план</a>{/if}
			</p>
		{/if}

		{#if top && isCurrentWeek}
			<p class="priority">Сегодня в приоритете: <b>{top.title}</b></p>
		{/if}
		{/if}
	{/if}
	<a class="settings" href="/settings" data-sveltekit-reload>Настройки</a>
</main>

{#if sheet && sheetPractice}
	{@const sp = sheetPractice}
	{@const sd = sheet.date}
	{#key `${sp.id}|${sd}`}
		<NoteSheet
			p={sp}
			dateLabel={sd === today ? 'сегодня' : label(sd)}
			amount={amountOf(sp.id, sd)}
			onDose={(a) => mark(sp, sd, a)}
			onNote={(doc) => saveNote(sp, doc)}
			onClose={() => (sheet = undefined)}
		/>
	{/key}
{/if}

{#snippet todayScreen()}
	{#if day.planned}
		<p class="priority today-top">
			{#if day.top}В приоритете: <b>{day.top}</b>{:else}План на сегодня выполнен{/if}
		</p>
	{:else}
		<p class="empty-day">На сегодня ничего не запланировано</p>
	{/if}

	{#if day.todo.length}
		<h2 class="zone">К выполнению</h2>
		<ul class="cards">
			{#each day.todo as p (p.id)}
				<li in:receive={{ key: p.id }} out:send={{ key: p.id }} animate:flip={{ duration: 220 }}>
					{@render card(p, false)}
				</li>
			{/each}
		</ul>
	{/if}

	{#if day.done.length}
		<h2 class="zone">Сделано</h2>
		<ul class="cards">
			{#each day.done as d (d.p.id)}
				<li in:receive={{ key: d.p.id }} out:send={{ key: d.p.id }} animate:flip={{ duration: 220 }}>
					{@render card(d.p, d.bonus)}
				</li>
			{/each}
		</ul>
	{/if}

	{#if day.other.length}
		<details class="more" open={moreOpen || !day.planned} ontoggle={(e) => (moreOpen = (e.currentTarget as HTMLDetailsElement).open)}>
			<summary>Сделать что-то ещё <span class="count">{day.other.length}</span></summary>
			<ul class="cards">
				{#each day.other as p (p.id)}
					<li in:receive={{ key: p.id }} out:send={{ key: p.id }} animate:flip={{ duration: 220 }}>
						{@render card(p, false)}
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if week?.plan}<p class="week-sum"><a href="/plan?start={start}">Изменить план</a></p>{/if}
{/snippet}

{#snippet card(p: PracticeView, bonus: boolean)}
	{@const a = amountOf(p.id, today)}
	{@const dep = depth(a, p)}
	{@const line = firstLine(p.note)}
	<div class="card-wrap" data-depth={dep}>
		<button
			class="card"
			data-depth={dep}
			style={cellStyle(p.color)}
			aria-label="{p.title}: {a ? `${a} ${p.unit}` : 'не отмечено'}{bonus ? ', бонус' : ''}"
			onpointerdown={() => down(p, today)}
			onpointerup={() => cardUp(p)}
			onpointerleave={cancel}
			onpointercancel={cancel}
			oncontextmenu={(e) => e.preventDefault()}
		>
			<span class="box" aria-hidden="true">{#if counts(a, p)}<svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6 9.6 3.4" /></svg>{/if}</span>
			<span class="ctext">
				<span class="ctitle">{p.title}{#if bonus}<span class="tag">бонус</span>{/if}</span>
				{#if p.goalTitle !== p.title}<small>{p.goalTitle}</small>{/if}
				{#if line}<span class="cline">→ {line}</span>{/if}
			</span>
			<span class="dose">{a && !counts(a, p) ? `${a} из ${p.normDose} ${p.unit}` : a ? `${a} ${p.unit}` : doseHint(p)}</span>
		</button>
		<button class="more-btn" aria-label="{p.title}: доза и заметка" onclick={() => openSheet(p, today)}>⋯</button>
	</div>
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
		padding: calc(env(safe-area-inset-top) + 12px) 12px calc(env(safe-area-inset-bottom) + 24px);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	.range {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-weight: 600;
	}
	.nav {
		background: none;
		border: none;
		font-size: 28px;
		width: 44px;
		height: 44px;
		cursor: pointer;
	}
	.link {
		background: none;
		border: none;
		color: var(--muted);
		font-size: 13px;
		font-weight: 400;
		padding: 2px;
		cursor: pointer;
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
	.lens {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2px;
		padding: 2px;
		margin: 0 0 12px;
		border-radius: 10px;
		background: color-mix(in oklab, var(--line) 60%, transparent);
	}
	.lens button {
		min-height: 36px;
		border: none;
		border-radius: 8px;
		background: none;
		font-size: 14px;
		color: var(--muted);
		cursor: pointer;
	}
	.lens button.on {
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
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
	.week-sum a {
		color: var(--text);
	}
	.today-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		min-height: 44px;
		margin-bottom: 8px;
	}
	.today-head h1 {
		font-size: 22px;
		margin: 0;
	}
	.today-head span {
		color: var(--muted);
		font-size: 14px;
	}
	.sublens {
		display: flex;
		gap: 6px;
		margin: -4px 0 12px;
	}
	.sublens button {
		min-height: 32px;
		padding: 0 12px;
		border-radius: 16px;
		border: 1px solid var(--line);
		background: none;
		color: var(--muted);
		font-size: 13px;
		cursor: pointer;
	}
	.sublens button.on {
		background: var(--text);
		border-color: var(--text);
		color: var(--bg);
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
	.card {
		--c: var(--c-light);
		--fg: var(--text);
		width: 100%;
		min-height: 60px;
		display: flex;
		align-items: center;
		gap: 12px;
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
	.ctext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.ctitle {
		font-size: 16px;
		font-weight: 600;
	}
	.ctext small {
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
	.card-wrap .card {
		padding-right: 48px;
	}
	.more-btn {
		position: absolute;
		top: 50%;
		right: 6px;
		transform: translateY(-50%);
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
	.settings {
		display: block;
		width: fit-content;
		margin: 28px auto 0;
		padding: 12px;
		color: var(--muted);
		font-size: 14px;
		text-decoration: none;
	}
</style>
