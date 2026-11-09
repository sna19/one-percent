<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { addDays, isDateStr, todayStr, weekDays, weekStart } from '#lib/dates.js';
	import { colorOf } from '#lib/palette.js';
	import { groupPractices } from '#lib/groups.js';
	import type { PlanView, PracticeView, WeekSummary } from '#lib/types.js';

	/** Spec 003 — plan a week in about a minute: pick a source, adjust, confirm. */
	interface PlannerData {
		start: string;
		practices: PracticeView[];
		plan: PlanView | null;
		templates: { id: number; name: string }[];
		pastWeeks: ({ weekStart: string } & WeekSummary)[];
		limit: number | null;
	}

	const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
	const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
	const label = (s: string) => {
		const [, m, d] = s.split('-').map(Number);
		return `${d} ${MONTHS[m - 1]}`;
	};

	const today = todayStr();
	const q = page.url.searchParams.get('start');
	const start = isDateStr(q) ? weekStart(q) : weekStart(today);
	const days = weekDays(start);

	let data = $state<PlannerData | undefined>();
	let error = $state<string | undefined>();
	let busy = $state(false);
	let picker = $state<'template' | 'week' | undefined>();
	let saveTemplate = $state(false);
	let templateName = $state('');
	let done = $state(false);

	const planned = $derived(new Set(Object.entries(data?.plan?.items ?? {}).flatMap(([p, ds]) => ds.map((d) => `${p}|${d}`))));
	const isPlanned = (pid: number, d: string) => planned.has(`${pid}|${d}`);
	const groups = $derived(groupPractices(data?.practices ?? [], 'goal'));
	const practiceCount = $derived(Object.values(data?.plan?.items ?? {}).filter((ds) => ds.length).length);
	const sessionCount = $derived(planned.size);
	const tooMany = $derived(data?.limit != null && practiceCount > data.limit);

	async function call(body: Record<string, unknown> | null) {
		busy = true;
		error = undefined;
		try {
			const r = body
				? await fetch('/api/plan', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ start, today, ...body })
					})
				: await fetch(`/api/plan?start=${start}&today=${today}`);
			const j = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(j.message ?? `Ошибка ${r.status}`);
			data = j;
			return true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Нет связи с сервером';
			return false;
		} finally {
			busy = false;
		}
	}

	const source = (src: string) => {
		picker = undefined;
		call({ action: 'source', source: src });
	};
	// Taps show at once and go to the server one by one. Taps not yet confirmed by the server
	// are re-applied on top of each answer, so a quick series of taps never flickers back.
	const unconfirmed = new Map<string, boolean>();
	let chain: Promise<unknown> = Promise.resolve();

	function show(pid: number, d: string, on: boolean) {
		if (!data) return;
		data.plan ??= { weekStart: start, status: 'draft', source: 'empty', items: {} };
		const ds = data.plan.items[pid] ?? [];
		const next = on ? (ds.includes(d) ? ds : [...ds, d]) : ds.filter((x) => x !== d);
		data.plan.items = { ...data.plan.items, [pid]: next };
	}

	function reapplyUnconfirmed() {
		for (const [key, on] of unconfirmed) {
			const [pid, d] = key.split('|');
			show(Number(pid), d, on);
		}
	}

	const toggle = (p: PracticeView, d: string) => {
		if (d < today) return;
		const on = !isPlanned(p.id, d); // decide before changing anything on screen
		const key = `${p.id}|${d}`;
		unconfirmed.set(key, on);
		show(p.id, d, on);
		chain = chain.then(async () => {
			await call({ action: 'item', practiceId: p.id, date: d, planned: on });
			if (unconfirmed.get(key) === on) unconfirmed.delete(key);
			reapplyUnconfirmed();
		});
	};
	const row = (p: PracticeView, mode: 'daily' | 'default' | 'clear') => call({ action: 'row', practiceId: p.id, mode });

	async function confirm() {
		const ok = await call({ action: 'confirm', templateName: saveTemplate ? templateName : undefined });
		if (ok) done = true;
	}

	onMount(() => call(null));

	const style = (c: string) => `--c-light:${colorOf(c).light};--c-dark:${colorOf(c).dark}`;
</script>

<svelte:head><title>План · 1%</title></svelte:head>

<main>
	<header>
		<a href="/" class="back">‹ Неделя</a>
		<h1>План · {label(days[0])} – {label(days[6])}</h1>
	</header>

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if done}
		<div class="done">
			<p>План утверждён{saveTemplate && templateName ? `, шаблон «${templateName}» сохранён` : ''}.</p>
			<a class="primary" href="/">К неделе</a>
		</div>
	{:else if !data}
		<p class="muted">Загрузка…</p>
	{:else}
		<section>
			<h2>1. Источник</h2>
			<div class="sources">
				<button disabled={busy} onclick={() => source('previous')}>Как прошлая неделя</button>
				<button disabled={busy} onclick={() => source('empty')}>С нуля</button>
				<button disabled={busy || !data.templates.length} onclick={() => (picker = picker === 'template' ? undefined : 'template')}
					>Шаблон{data.templates.length ? '' : ' (нет)'}</button
				>
				<button disabled={busy || !data.pastWeeks.length} onclick={() => (picker = picker === 'week' ? undefined : 'week')}
					>Другая неделя</button
				>
			</div>
			{#if picker === 'template'}
				<ul class="pick">
					{#each data.templates as t (t.id)}
						<li><button onclick={() => source(`template:${t.id}`)}>{t.name}</button></li>
					{/each}
				</ul>
			{:else if picker === 'week'}
				<ul class="pick">
					{#each data.pastWeeks as w (w.weekStart)}
						<li>
							<button onclick={() => source(`week:${w.weekStart}`)}
								>{label(w.weekStart)} – {label(addDays(w.weekStart, 6))}
								<span class="muted">по плану {w.done} из {w.planned}</span></button
							>
						</li>
					{/each}
				</ul>
			{/if}
			{#if start <= today && days.some((d) => d < today)}
				<p class="muted small">Прошедшие дни недели не меняются: источник заполняет план с сегодняшнего дня.</p>
			{/if}
		</section>

		<section>
			<h2>2. Редактор</h2>
			<p class="muted small">
				В плане {practiceCount} практик, {sessionCount} занятий. Тап по клетке включает и выключает день.
			</p>
			{#if tooMany}
				<p class="warn">В плане {practiceCount} практик. Это реалистично?</p>
			{/if}
			<div class="grid">
				<div></div>
				{#each days as d (d)}
					<div class="day" class:is-today={d === today}>
						<span>{DAY_NAMES[new Date(d + 'T12:00').getDay()]}</span><b>{Number(d.slice(8))}</b>
					</div>
				{/each}
				{#each groups as g (g.key)}
					{#if g.practices.length > 1 || g.practices[0].title !== g.title}<div class="goal">{g.title}</div>{/if}
					{#each g.practices as p (p.id)}
						<div class="name">
							<span>{p.title}</span>
							<span class="quick">
								<button disabled={busy} onclick={() => row(p, 'daily')}>каждый день</button>
								{#if p.defaultDays.length}<button disabled={busy} onclick={() => row(p, 'default')}>обычные дни</button>{/if}
								<button disabled={busy} onclick={() => row(p, 'clear')}>очистить</button>
							</span>
						</div>
						{#each days as d (d)}
							<button
								class="cell"
								class:on={isPlanned(p.id, d)}
								class:usual={p.defaultDays.includes(new Date(d + 'T12:00').getDay())}
								style={style(p.color)}
								disabled={d < today}
								aria-pressed={isPlanned(p.id, d)}
								aria-label="{p.title}, {label(d)}"
								onclick={() => toggle(p, d)}
							></button>
						{/each}
					{/each}
				{/each}
			</div>
		</section>

		<section>
			<h2>3. Утвердить</h2>
			<label class="check"><input type="checkbox" bind:checked={saveTemplate} /> Сохранить как шаблон</label>
			{#if saveTemplate}
				<input class="text" bind:value={templateName} placeholder="Например, «Обычная неделя»" maxlength="100" />
			{/if}
			<button class="primary" disabled={busy || (saveTemplate && !templateName.trim())} onclick={confirm}>Утвердить план</button>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: calc(env(safe-area-inset-top) + 12px) 12px calc(env(safe-area-inset-bottom) + 32px);
	}
	header {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	h1 {
		font-size: 18px;
		margin: 8px 0 8px;
	}
	h2 {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 20px 0 8px;
	}
	.back {
		color: var(--muted);
		text-decoration: none;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		flex: none;
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 13px;
		margin: 6px 0;
	}
	button {
		cursor: pointer;
	}
	.sources {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.sources button,
	.pick button,
	.primary {
		min-height: 44px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 15px;
	}
	.pick {
		list-style: none;
		padding: 0;
		margin: 8px 0 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.pick button {
		width: 100%;
		text-align: left;
		padding: 0 12px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(118px, 2.1fr) repeat(7, minmax(0, 1fr));
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
	.goal {
		grid-column: 1 / -1;
		font-size: 13px;
		font-weight: 600;
		margin-top: 8px;
	}
	.name {
		display: flex;
		flex-direction: column;
		font-size: 14px;
		line-height: 1.2;
		padding-left: 8px;
		hyphens: auto;
		-webkit-hyphens: auto;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 0 8px;
	}
	.quick button {
		border: none;
		background: none;
		padding: 4px 0;
		font-size: 11px;
		color: var(--muted);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.cell {
		--c: var(--c-light);
		aspect-ratio: 1;
		width: 100%;
		border-radius: 8px;
		border: 1.5px dashed var(--line);
		background: transparent;
		padding: 0;
		touch-action: manipulation;
	}
	@media (prefers-color-scheme: dark) {
		.cell {
			--c: var(--c-dark);
		}
	}
	/* usual days of the practice: a faint hint */
	.cell.usual {
		background: color-mix(in oklab, var(--c) 12%, transparent);
	}
	.cell.on {
		border: 2px solid var(--c);
		background: color-mix(in oklab, var(--c) 22%, transparent);
	}
	.cell:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.warn {
		background: color-mix(in oklab, #c98a06 18%, var(--surface));
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 14px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-size: 15px;
	}
	.check input {
		width: 20px;
		height: 20px;
	}
	.text {
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
		font-size: 17px;
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		margin-bottom: 10px;
	}
	.primary {
		width: 100%;
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
	}
	.primary:disabled {
		opacity: 0.4;
	}
	.error {
		background: color-mix(in oklab, #c98a06 18%, var(--surface));
		padding: 10px 14px;
		border-radius: 10px;
	}
	.done {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 24px;
	}
</style>
