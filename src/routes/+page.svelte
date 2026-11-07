<script lang="ts">
	import { onMount } from 'svelte';
	import { addDays, todayStr, weekDays, weekStart } from '#lib/dates.js';
	import { colorOf } from '#lib/palette.js';
	import { counts, daysWithout, depth, priority } from '#lib/rules.js';
	import { cacheWeek, cachedWeek, enqueue, flush, pending } from '#lib/store.js';
	import type { PracticeView, WeekData } from '#lib/types.js';

	const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
	const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

	let today = $state(todayStr());
	let start = $state(weekStart(todayStr()));
	let week = $state<WeekData | undefined>();
	let offline = $state(false);
	let queued = $state(0);
	let sheet = $state<{ p: PracticeView; date: string; value: string } | undefined>();

	const days = $derived(weekDays(start));
	const isCurrentWeek = $derived(start === weekStart(today));

	const amountOf = (pid: number, date: string) => week?.entries[pid]?.[date];

	const rows = $derived(
		(week?.practices ?? []).map((p) => {
			const n = daysWithout(p.lastDone, p.createdOn, today);
			return { ...p, n, doneToday: p.lastDone === today };
		})
	);
	const top = $derived(priority(rows));

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
		try {
			const r = await fetch(`/api/week?start=${s}&today=${today}`);
			if (!r.ok || !r.headers.get('content-type')?.includes('json')) throw new Error();
			const fresh: WeekData = await r.json();
			await cacheWeek(fresh);
			await withPending(fresh); // local marks not on the server yet
			if (s === start) week = fresh;
			offline = false;
		} catch {
			offline = true;
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

	function cellStyle(p: PracticeView, date: string) {
		const c = colorOf(p.color);
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

	{#if offline}
		<p class="status">Нет связи{queued ? ` · не отправлено: ${queued}` : ''}</p>
	{/if}

	{#if !week}
		<p class="status">Загрузка…</p>
	{:else}
		<div class="grid" style="--cols:{days.length}">
			<div></div>
			{#each days as d (d)}
				<div class="day" class:is-today={d === today}>
					<span>{DAY_NAMES[new Date(d + 'T12:00').getDay()]}</span>
					<b>{Number(d.slice(8))}</b>
				</div>
			{/each}

			{#each rows as p (p.id)}
				<div class="name">
					<span>{p.title}</span>
					{#if p.n >= 2}<small>{p.n} {p.n % 10 === 1 && p.n % 100 !== 11 ? 'день' : p.n % 10 >= 2 && p.n % 10 <= 4 && (p.n % 100 < 10 || p.n % 100 >= 20) ? 'дня' : 'дней'} без</small>{/if}
				</div>
				{#each days as d (d)}
					{@const a = amountOf(p.id, d)}
					{@const dep = depth(a, p)}
					<button
						class="cell"
						class:future={d > today}
						class:is-today={d === today}
						data-depth={dep}
						style={cellStyle(p, d)}
						disabled={d > today}
						aria-label="{p.title}, {label(d)}: {a ? `${a} ${p.unit}` : 'нет'}"
						onpointerdown={() => down(p, d)}
						onpointerup={() => tap(p, d)}
						onpointerleave={cancel}
						onpointercancel={cancel}
						oncontextmenu={(e) => e.preventDefault()}
					></button>
				{/each}
			{/each}

			<div class="name total">День</div>
			{#each days as d (d)}
				<div class="total" class:future={d > today}>
					{#if d <= today}{rows.filter((p) => counts(amountOf(p.id, d), p)).length}/{rows.length}{/if}
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
	.status {
		text-align: center;
		color: var(--muted);
		font-size: 13px;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(96px, 1.7fr) repeat(var(--cols), minmax(0, 1fr));
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
