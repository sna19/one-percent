<script lang="ts">
	import { onMount } from 'svelte';
	import { addDays, todayStr, weekDays, weekStart } from '#lib/dates.js';
	import { colorOf } from '#lib/palette.js';
	import { daysWithout, depth, priority } from '#lib/rules.js';
	import { dayScore, groupCell, groupDaysWithout, groupPractices, type Group, type Lens } from '#lib/groups.js';
	import { cacheWeek, cachedWeek, enqueue, flush, pending } from '#lib/store.js';
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
	let sheet = $state<{ p: PracticeView; date: string; value: string } | undefined>();

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
	let lens = $state<Lens>(read('lens', 'goal'));
	let open = $state<string[]>(read('open-groups', []));
	function setLens(l: Lens) {
		lens = l;
		write('lens', l);
	}
	function toggle(key: string) {
		open = open.includes(key) ? open.filter((k) => k !== key) : [...open, key];
		write('open-groups', open);
	}

	const practices = $derived(week?.practices ?? []);
	const groups = $derived(groupPractices(practices, lens));
	const nOf = (p: PracticeView) => daysWithout(p.lastDone, p.createdOn, today);
	// Priority is chosen among goals, whatever the lens.
	const top = $derived(
		priority(
			groupPractices(practices, 'goal').map((g, i) => ({
				id: i,
				title: g.title,
				n: groupDaysWithout(g, today),
				doneToday: g.practices.some((p) => p.lastDone === today)
			}))
		)
	);

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
			sheet = { p, date, value: String(amountOf(p.id, date) ?? p.normDose) };
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

	function choose(amount: number) {
		if (!sheet) return;
		mark(sheet.p, sheet.date, amount);
		sheet = undefined;
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
		<div class="lens" role="radiogroup" aria-label="Группировка">
			<button role="radio" aria-checked={lens === 'goal'} class:on={lens === 'goal'} onclick={() => setLens('goal')}>По целям</button>
			<button role="radio" aria-checked={lens === 'format'} class:on={lens === 'format'} onclick={() => setLens('format')}>По формату</button>
		</div>
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
						<button
							class="cell"
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
				{@const sc = dayScore(practices, d, amountOf)}
				<div class="total" class:future={d > today} aria-label="целей: {sc.done} из {sc.total}">
					{#if d <= today}{sc.done}/{sc.total}{/if}
				</div>
			{/each}
		</div>

		{#if top && isCurrentWeek}
			<p class="priority">Сегодня в приоритете: <b>{top.title}</b></p>
		{/if}
	{/if}
	<a class="settings" href="/settings" data-sveltekit-reload>Настройки</a>
</main>

{#if sheet}
	{@const s = sheet}
	<div class="backdrop" role="presentation" onclick={() => (sheet = undefined)}></div>
	<div class="sheet" role="dialog" aria-label="Отметка">
		<p class="sheet-title">{s.p.title} · {label(s.date)}</p>
		<div class="choices">
			<button onclick={() => choose(s.p.minDose)}>Минимум · {s.p.minDose} {s.p.unit}</button>
			<button onclick={() => choose(s.p.normDose)}>Норма · {s.p.normDose} {s.p.unit}</button>
		</div>
		<form
			class="exact"
			onsubmit={(e) => {
				e.preventDefault();
				const v = Number(s.value.replace(',', '.'));
				if (Number.isFinite(v) && v >= 0) choose(v);
			}}
		>
			<input type="text" inputmode="decimal" bind:value={s.value} aria-label="Количество" />
			<span>{s.p.unit}</span>
			<button type="submit">Сохранить</button>
		</form>
		<div class="choices">
			<button class="quiet" onclick={() => choose(0)}>Очистить</button>
			<button class="quiet" onclick={() => (sheet = undefined)}>Отмена</button>
		</div>
	</div>
{/if}

{#snippet practiceRow(p: PracticeView, title: string, sub: string, indent: boolean)}
	{@const n = nOf(p)}
	<div class="name" class:indent>
		<span>{title}</span>
		{#if sub || n >= 2}<small>{[sub, n >= 2 ? without(n) : ''].filter(Boolean).join(' · ')}</small>{/if}
	</div>
	{#each days as d (d)}
		{@const a = amountOf(p.id, d)}
		<button
			class="cell"
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
		grid-template-columns: 1fr 1fr;
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
	.settings {
		display: block;
		width: fit-content;
		margin: 28px auto 0;
		padding: 12px;
		color: var(--muted);
		font-size: 14px;
		text-decoration: none;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.35);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: 560px;
		margin: 0 auto;
		background: var(--surface);
		border-radius: 16px 16px 0 0;
		padding: 16px 16px calc(env(safe-area-inset-bottom) + 16px);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.sheet-title {
		margin: 0 0 4px;
		font-weight: 600;
	}
	.choices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.sheet button {
		min-height: 44px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		cursor: pointer;
	}
	.sheet button.quiet {
		background: none;
	}
	.exact {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.exact input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		font-size: 17px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
	}
	.exact button {
		padding: 0 16px;
	}
</style>
