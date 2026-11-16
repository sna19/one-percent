<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import TopBar from '#lib/TopBar.svelte';
	import Star from '@lucide/svelte/icons/star';
	import { backFrom } from '#lib/back.js';
	import { addDays, todayStr, weekStart, type DateStr } from '#lib/dates.js';
	import { amountLabel } from '#lib/milestones.js';
	import { colorOf } from '#lib/palette.js';
	import { num, REVIEW, type GoalWeek, type WeeklyReview } from '#lib/review.js';

	/**
	 * Spec 010 — «Итоги недели»: management by exception. Only what moved away from the usual is shown in
	 * detail; each block opens with one sentence, at most three rows, the rest behind «ещё N». Comparison is
	 * only with yourself; no red, no streaks. The second step of Sunday: inbox → review → plan.
	 */
	const today = todayStr();
	let r = $state<WeeklyReview | null>(null);
	let error = $state<string | null>(null);
	let retro = $state('');
	let saved = $state('');
	let openCats = $state<number[]>([]);
	let more = $state<Record<string, boolean>>({});
	let showNormal = $state(false);
	let showPaused = $state(false);

	async function load(start?: string) {
		error = null;
		const q = new URLSearchParams({ today });
		if (start) q.set('start', start);
		const res = await fetch(`/api/review?${q}`).catch(() => undefined);
		if (!res?.ok) {
			error = 'Итоги не загрузились: нет связи с сервером';
			return;
		}
		r = await res.json();
		retro = saved = r!.retroText;
	}
	onMount(() => {
		load(page.url.searchParams.get('start') ?? undefined);
		loadFocus();
	});

	// #26: ☆ / ★ — the focus of the current week can be set right from the review
	let nowFocus = $state<number[] | null>(null);
	async function loadFocus() {
		const r = await fetch(`/api/plan?start=${weekStart(today)}&today=${today}`).catch(() => undefined);
		if (r?.ok) nowFocus = (await r.json()).plan?.focus ?? [];
	}
	async function toggleFocus(goalId: number) {
		if (!nowFocus) return;
		const on = nowFocus.includes(goalId);
		if (!on && nowFocus.length >= 3) {
			error = 'В фокусе уже 3 цели — сними одну на экране «Цели»';
			return;
		}
		const next = on ? nowFocus.filter((x) => x !== goalId) : [...nowFocus, goalId];
		if (await post({ action: 'focus', start: weekStart(today), today, goalIds: next })) nowFocus = next;
	}

	async function post(body: Record<string, unknown>) {
		const res = await fetch('/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
		if (!res?.ok) error = 'Не сохранилось: нет связи с сервером';
		return !!res?.ok;
	}
	async function saveRetro() {
		if (!r || retro === saved) return;
		if (await post({ action: 'retro', start: r.start, retroText: retro })) saved = retro;
	}
	async function answer(v: 'yes' | 'partly' | 'no') {
		if (!r?.previous) return;
		if (await post({ action: 'retro', start: r.previous.start, retroResult: v })) r.previous.retroResult = v;
	}
	async function toPlanning() {
		await saveRetro();
		goto(`/plan?start=${addDays(r!.start, 7)}&from=week`);
	}

	const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
	const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
	const label = (d: DateStr) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
	const dayName = (d: DateStr) => DAYS[new Date(`${d}T12:00`).getDay()];
	const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
	const words = (n: number, one: string, few: string, many: string) =>
		n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many;
	const goalsWord = (n: number) => `${n} ${words(n, 'цель', 'цели', 'целей')}`;
	const rows = <T,>(key: string, xs: T[]) => (more[key] ? xs : xs.slice(0, REVIEW.MAX_ROWS));

	const timeTotal = $derived(r ? r.time.reduce((s, t) => s + t.minutes, 0) : 0);
	const timeSentence = $derived.by(() => {
		if (!r?.time.length) return '';
		const top = r.time[0];
		const share = top.minutes / timeTotal;
		return share >= REVIEW.TIME_SKEW ? `${Math.round(share * 100)}% времени — ${top.name}.` : 'Время распределено без сильного перекоса.';
	});
	const realism = $derived.by(() => {
		if (!r) return '';
		const parts: string[] = [];
		if (r.weakDays.length) parts.push(`Слабые дни: ${r.weakDays.map(dayName).join(', ')} — меньше половины плана.`);
		else parts.push('Каждый день плана выполнен хотя бы наполовину.');
		if (r.weakPractices.length)
			parts.push(`${r.weakPractices.map((t) => `«${t}»`).join(', ')} ${REVIEW.WEAK_PRACTICE_WEEKS} недели подряд меньше половины плана — может, планировать реже?`);
		return parts.join(' ');
	});
	const fadeText = (f: WeeklyReview['fading'][number]) => (f.why === 'plan0' ? `по плану 0 из ${f.planned}` : `${f.done} против обычных ${num(f.usual ?? 0)}`);
	const goalPlan = (g: GoalWeek) => (g.planned ? `по плану ${g.plannedDone} из ${g.planned}` : 'не в плане') + (g.bonus ? ` · бонусов ${g.bonus}` : '');
	const PALETTE = ['var(--text)', 'color-mix(in oklab, var(--text) 60%, var(--bg))', 'color-mix(in oklab, var(--text) 35%, var(--bg))', 'color-mix(in oklab, var(--text) 18%, var(--bg))'];
	const shown = $derived(!!r && (r.previous || r.focus.length || r.fading.length || r.plan.planned || r.milestones.length));
</script>

<svelte:head><title>Итоги недели</title></svelte:head>

{#snippet fstar(goalId: number)}
	{#if nowFocus}
		{@const on = nowFocus.includes(goalId)}
		<button class="fstar" class:on aria-pressed={on} aria-label={on ? 'Убрать из фокуса этой недели' : 'В фокус этой недели'} onclick={() => toggleFocus(goalId)}
			><Star size={16} fill={on ? 'currentColor' : 'none'} /></button
		>
	{/if}
{/snippet}

<main>
	<TopBar
		help="review"
		title="Итоги недели"
		back={backFrom(page.url.searchParams, 'week')}
	/>

	{#if r}
		<!-- the week under the title is the picker itself: one line, not a form row -->
		<select class="pick" aria-label="Неделя" value={r.start} onchange={(e) => load(e.currentTarget.value)}>
			{#each r.weeks.filter((w) => w < weekStart(today) || w === r?.start) as w (w)}<option value={w}>{label(w)} – {label(addDays(w, 6))}</option>{/each}
		</select>
		<a class="obj weeklink" href="/?tab=week&start={r.start}">в «Неделе» →</a>
	{/if}

	{#if error}<p class="note" role="alert">{error}</p>{/if}

	{#if !r}
		{#if !error}<p class="muted center">Считаю…</p>{/if}
	{:else}
		{#if r.noPlan && !shown}
			<p class="note">У этой недели не было плана — считать не с чем.</p>
		{/if}

		{#if r.previous}
			<section>
				<p class="lead">Решение прошлой недели: «{r.previous.retroText}». Сработало?</p>
				<div class="seg" role="radiogroup" aria-label="Сработало?">
					{#each [['yes', 'Да'], ['partly', 'Частично'], ['no', 'Нет']] as [v, t] (v)}
						<button role="radio" aria-checked={r.previous.retroResult === v} class:on={r.previous.retroResult === v} onclick={() => answer(v as 'yes')}>{t}</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if r.focus.length}
			<section>
				<h2>Фокус</h2>
				<p class="lead">
					{r.focus.filter((f) => f.planned && f.plannedDone * 2 >= f.planned).length} из {r.focus.length} фокусных — по плану хотя бы наполовину.
				</p>
				<ul class="rows">
					{#each r.focus as f (f.goalId)}
						<li>
							<a href="/settings/goal/{f.goalId}?from=week"><span class="dot" style="--c:{colorOf(f.color).light}"></span>{f.title}</a>
							<span class="meta">{goalPlan(f)}{f.milestone ? ` · ${f.milestone}` : ''}</span>
							{@render fstar(f.goalId)}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if r.fading.length}
			<section>
				<h2>Что затухает</h2>
				<p class="lead">{goalsWord(r.fading.length)} ниже своего обычного — им стоит место в плане.</p>
				<ul class="rows">
					{#each rows('fading', r.fading) as f (f.goalId)}
						<li>
							<a href="/settings/goal/{f.goalId}?from=week"><span class="dot" style="--c:{colorOf(f.color).light}"></span>{f.title}</a>
							<span class="meta">{fadeText(f)}</span>
							{@render fstar(f.goalId)}
						</li>
					{/each}
				</ul>
				{#if r.fading.length > REVIEW.MAX_ROWS && !more.fading}<button class="more" onclick={() => (more.fading = true)}>ещё {r.fading.length - REVIEW.MAX_ROWS}</button>{/if}
				{#if r.overload}
					<p class="soft">Активных целей {r.overload.activeGoals}. Может, часть поставить на паузу? <a href="/settings?from=week">Настройки</a></p>
				{/if}
			</section>
		{:else if r.overload}
			<p class="soft">Активных целей {r.overload.activeGoals}. Может, часть поставить на паузу? <a href="/settings?from=week">Настройки</a></p>
		{/if}

		{#if r.plan.planned}
			<section>
				<h2>План</h2>
				<p class="lead">По плану {r.plan.done} из {r.plan.planned}{r.plan.bonus ? ` · бонусов ${r.plan.bonus}` : ''}.</p>
				<div class="bar" role="img" aria-label="Выполнено {pct(r.plan.done, r.plan.planned)}% плана">
					<span style="width:{pct(r.plan.done, r.plan.planned)}%"></span>
				</div>
				<div class="cats">
					{#each r.plan.categories as c (c.id)}
						<button aria-expanded={openCats.includes(c.id)} onclick={() => (openCats = openCats.includes(c.id) ? openCats.filter((x) => x !== c.id) : [...openCats, c.id])}>
							<span class="dot" style="--c:{colorOf(c.color).light}"></span>{c.name} {pct(c.done, c.planned)}%
						</button>
					{/each}
				</div>
				{#each r.plan.categories.filter((c) => openCats.includes(c.id)) as c (c.id)}
					<ul class="rows sub">
						{#each c.goals as g (g.goalId)}<li><a class="obj" href="/settings/goal/{g.goalId}?from=week">{g.title}</a><span class="meta">{g.plannedDone} из {g.planned}</span></li>{/each}
					</ul>
				{/each}
			</section>
		{/if}

		{#if r.milestones.length}
			<section>
				<h2>Майлстоны</h2>
				<p class="lead">Стоит посмотреть: отставание от темпа или скорый срок.</p>
				<ul class="rows">
					{#each rows('ms', r.milestones) as m (m.goalId)}
						<li><a href="/settings/goal/{m.goalId}?from=week">{m.goalTitle} · {m.title}</a><span class="meta">{m.text}</span></li>
					{/each}
				</ul>
				{#if r.milestones.length > REVIEW.MAX_ROWS && !more.ms}<button class="more" onclick={() => (more.ms = true)}>ещё {r.milestones.length - REVIEW.MAX_ROWS}</button>{/if}
			</section>
		{/if}

		{#if r.plan.planned}
			<section>
				<h2>Реалистичность плана</h2>
				<p class="lead">{realism}</p>
				<div class="days" role="img" aria-label="Выполнение плана по дням">
					{#each r.days as d (d.date)}
						{@const linked = d.date <= addDays(weekStart(today), 13)}
						<svelte:element this={linked ? 'a' : 'div'} class="day obj" class:weak={r.weakDays.includes(d.date)} href={linked ? `/?day=${d.date}` : undefined}>
							<span class="col"><span style="height:{d.planned ? pct(d.done, d.planned) : 0}%"></span></span>
							<small>{dayName(d.date)}</small>
						</svelte:element>
					{/each}
				</div>
			</section>
		{/if}

		{#if r.time.length}
			<section>
				<h2>Куда ушло время</h2>
				<p class="lead">{amountLabel(timeTotal, 'мин')} всего. {timeSentence}</p>
				<div class="stack" role="img" aria-label="Минуты по форматам">
					{#each r.time as t, i (t.name)}<span style="width:{pct(t.minutes, timeTotal)}%;background:{PALETTE[Math.min(i, 3)]}"></span>{/each}
				</div>
				<ul class="legend">
					{#each r.time as t, i (t.name)}<li><span class="sw" style="background:{PALETTE[Math.min(i, 3)]}"></span>{t.name} · {amountLabel(t.minutes, 'мин')}</li>{/each}
				</ul>
			</section>
		{/if}

		{#if r.normal.length}
			<button class="fold" aria-expanded={showNormal} onclick={() => (showNormal = !showNormal)}>В норме: {goalsWord(r.normal.length)}</button>
			{#if showNormal}
				<ul class="rows sub">
					{#each r.normal as g (g.goalId)}<li><a href="/settings/goal/{g.goalId}?from=week">{g.title}</a><span class="meta">{goalPlan(g)}</span>{@render fstar(g.goalId)}</li>{/each}
				</ul>
			{/if}
		{/if}
		{#if r.paused.length}
			<button class="fold" aria-expanded={showPaused} onclick={() => (showPaused = !showPaused)}>На паузе по плану: {goalsWord(r.paused.length)}</button>
			{#if showPaused}
				<ul class="rows sub">
					{#each r.paused as g (g.goalId)}<li><a class="obj" href="/settings/goal/{g.goalId}?from=week">{g.title}</a><span class="meta">{g.supported ? 'поддержал на паузе' : ''}</span></li>{/each}
				</ul>
			{/if}
		{/if}

		<section class="retro">
			<label
				>Что изменишь на следующей неделе?
				<textarea bind:value={retro} onblur={saveRetro} rows="3" placeholder="Одно изменение — например, «спорт утром»"></textarea>
			</label>
			<button class="primary" onclick={toPlanning}>Перейти к планированию</button>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px 16px;
	}
	section {
		margin: 0 0 14px;
	}
	h2 {
		margin: 0 0 4px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.lead {
		margin: 0 0 6px;
		font-size: 15px;
	}
	.muted {
		color: var(--muted);
	}
	.center {
		text-align: center;
	}
	.note,
	.soft {
		font-size: 14px;
		color: var(--muted);
	}
	.soft a {
		color: var(--link);
	}
	.weeklink {
		margin-left: 10px;
		font-size: 14px;
		color: var(--muted);
	}
	.pick {
		margin: -6px 0 10px;
		padding: 2px 0;
		border: none;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		text-decoration: underline dotted;
		cursor: pointer;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface);
		border-radius: 12px;
	}
	.rows li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		min-height: 36px;
		padding: 3px 12px;
	}
	.rows li + li {
		border-top: 1px solid var(--line);
	}
	.rows a,
	.rows span:first-child {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		color: var(--text);
		text-decoration: none;
	}
	.rows .meta {
		flex: none;
		max-width: 55%;
		text-align: right;
		font-size: 13px;
		color: var(--muted);
	}
	.fstar {
		flex: none;
		width: 36px;
		height: 36px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-right: -8px;
		border: none;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.fstar.on {
		color: var(--text);
	}
	.sub {
		margin-top: 6px;
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--c);
	}
	.more,
	.fold {
		min-height: 40px;
		border: none;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
		padding: 0;
	}
	.fold {
		display: block;
		width: 100%;
		text-align: left;
		border-top: 1px solid var(--line);
	}
	.bar {
		height: 10px;
		border-radius: 5px;
		background: var(--surface);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--text);
		opacity: 0.75;
	}
	.cats {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin-top: 8px;
	}
	.cats button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 32px;
		padding: 0;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px;
	}
	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.col {
		position: relative;
		width: 100%;
		height: 36px;
		border-radius: 6px;
		background: var(--surface);
		overflow: hidden;
	}
	.col span {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		background: var(--text);
		opacity: 0.7;
	}
	/* weak days — grey, never red */
	.day.weak .col span {
		opacity: 0.3;
	}
	.day small {
		font-size: 11px;
		color: var(--muted);
	}
	.stack {
		display: flex;
		height: 12px;
		border-radius: 6px;
		overflow: hidden;
		background: var(--surface);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 12px;
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
		font-size: 13px;
		color: var(--muted);
	}
	.sw {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 4px;
		border-radius: 2px;
	}
	.seg {
		display: flex;
		gap: 6px;
	}
	.seg button {
		flex: 1;
		min-height: 40px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
	}
	.retro {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.retro label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 15px;
	}
	textarea {
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 16px;
		resize: vertical;
	}
	.primary {
		min-height: 48px;
		border: none;
		border-radius: 12px;
		background: var(--text);
		color: var(--bg);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
</style>
