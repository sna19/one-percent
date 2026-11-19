<script lang="ts">
	import { appNum } from '#lib/appSettings.svelte.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Flag from '@lucide/svelte/icons/flag';
	import Star from '@lucide/svelte/icons/star';
	import CirclePlus from '@lucide/svelte/icons/circle-plus';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import DeedSheet from '#lib/DeedSheet.svelte';
	import type { StepView } from '#lib/steps.js';
	import { group, GROUPINGS, idleDays, idleLabel, search, sortGoals, SORTS, type GroupBy, type SortBy } from '#lib/goalFinder.js';
	import TopBar from '#lib/TopBar.svelte';
	import GoalImage from '#lib/GoalImage.svelte';
	import QuickCapture from '#lib/inbox/QuickCapture.svelte';
	import { todayStr, weekDays, weekStart } from '#lib/dates.js';
	import { amountLabel, budgetLabel, pace, remaining } from '#lib/milestones.js';
	import { colorOf } from '#lib/palette.js';
	import { keyOf, nav } from '#lib/nav.svelte.js';
	import type { Gallery, GalleryGoal } from '#lib/server/goals.js';

	/**
	 * #31 (owner's request 19.11.2026, replaces the tiers of #26) — «Цели» as a finder: a search line on top, one
	 * list of all goals grouped by a chip (★ plan, movement, categories, formats, …), ★ focus to come back fast,
	 * and a goal's row opens in place with its practices and deeds — through the goal to the task in one tap.
	 */
	const today = todayStr();
	const days = weekDays(weekStart(today));
	let g = $state<Gallery | null>(null);
	let error = $state<string | null>(null);
	let capture: QuickCapture;
	let replacing = $state<GalleryGoal | null>(null);

	// the grouping, the order, folded groups and opened goals are remembered on this device
	let by = $state<GroupBy>('plan');
	let sortBy = $state<SortBy>('own');
	let folded = $state<string[]>(['plan:path', 'plan:paused']);
	let opened = $state<number[]>([]);
	let query = $state('');
	const keep = (k: string, v: unknown) => {
		try {
			localStorage.setItem(k, JSON.stringify(v));
		} catch {
			/* not critical */
		}
	};
	onMount(async () => {
		try {
			const v = JSON.parse(localStorage.getItem('goals-finder') ?? 'null');
			if (v) {
				if (GROUPINGS.some((x) => x.key === v.by)) by = v.by;
				if (SORTS.some((x) => x.key === v.sortBy)) sortBy = v.sortBy;
				if (Array.isArray(v.folded)) folded = v.folded;
				if (Array.isArray(v.opened)) opened = v.opened;
			}
		} catch {
			/* private mode */
		}
		await load();
		nav.restore(keyOf(page.url));
	});
	const save = () => keep('goals-finder', { by, sortBy, folded, opened });
	function fold(k: string) {
		const key = `${by}:${k}`;
		folded = folded.includes(key) ? folded.filter((x) => x !== key) : [...folded, key];
		save();
	}
	function toggle(id: number) {
		opened = opened.includes(id) ? opened.filter((x) => x !== id) : [...opened, id];
		save();
	}
	function setBy(k: GroupBy) {
		by = k;
		save();
	}
	function setSort(k: SortBy) {
		sortBy = k;
		save();
	}

	async function load() {
		const r = await fetch(`/api/goals?today=${today}`).catch(() => undefined);
		if (!r?.ok) {
			error = 'Цели не загрузились: нет связи с сервером';
			return;
		}
		g = await r.json();
		error = null;
	}

	const all = $derived(g ? g.categories.flatMap((c) => c.goals) : []);
	const focus = $derived(g ? g.focus.map((id) => all.find((x) => x.id === id)).filter((x): x is GalleryGoal => !!x) : []);
	/** the goals of growth and the spheres: what the finder lists */
	const everything = $derived(g ? [...all, ...(g.areaGoals ?? [])] : []);
	const groups = $derived(
		g
			? group(by, everything, g.path, g.categories, g.formats ?? [], today).map((x) => ({
					...x,
					// ★ focus keeps its own order; the rest follow the chosen order
					goals: by === 'plan' && x.key === 'focus' ? focus : sortGoals(x.goals, sortBy, today)
				}))
			: []
	);
	const hits = $derived(query.trim() ? search([...everything, ...(g?.path ?? [])], query) : null);

	// a deed opened from a goal's row: the same sheet as on «Сегодня»
	let deed = $state<StepView | null>(null);
	async function stepCall(body: Record<string, unknown>) {
		const r = await fetch('/api/steps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
		if (!r?.ok) {
			error = (await r?.json().catch(() => null))?.message ?? 'Нет связи с сервером';
			return null;
		}
		return r.json();
	}
	async function saveDeed(fields: Record<string, unknown>) {
		if (!deed) return;
		deed = { ...deed, ...fields } as StepView;
		await stepCall({ action: 'update', id: deed.id, fields });
	}
	async function removeDeed() {
		if (!deed || !confirm(`Убрать дело «${deed.title}»?`)) return;
		const id = deed.id;
		deed = null;
		await stepCall({ action: 'delete', id });
		await load();
	}
	async function deedDone() {
		if (!deed) return;
		const id = deed.id;
		deed = null;
		await stepCall({ action: 'done', id });
		await load();
	}
	async function closeDeed() {
		deed = null;
		await load();
	}
	const practicesWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'практика' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'практики' : 'практик'}`;

	/** ☆ → into focus; ★ → back to its place. A fourth asks which one to take out. */
	async function star(x: GalleryGoal, out?: GalleryGoal) {
		if (!g) return;
		let ids = [...g.focus];
		if (x.focus) ids = ids.filter((id) => id !== x.id);
		else if (out) ids = [...ids.filter((id) => id !== out.id), x.id];
		else if (ids.length >= appNum('goals.focus_max')) {
			replacing = x;
			return;
		} else ids = [...ids, x.id];
		replacing = null;
		const before = $state.snapshot(g);
		g.focus = ids;
		for (const c of g.categories) for (const y of c.goals) y.focus = ids.includes(y.id);
		const r = await fetch('/api/review', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'focus', start: weekStart(today), today, goalIds: ids })
		}).catch(() => undefined);
		if (!r?.ok) {
			g = before;
			error = (await r?.json().catch(() => null))?.message ?? 'Нет связи с сервером';
		}
	}

	async function newGoal() {
		const categoryId = g?.categories[0]?.id;
		const r = await fetch('/api/settings/newGoal', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(categoryId ? { categoryId } : {})
		}).catch(() => undefined);
		const j = await r?.json().catch(() => null);
		if (!r?.ok) {
			error = j?.message ?? 'Не получилось: сначала нужна категория в настройках';
			return;
		}
		goto(`/settings/goal/${j.id}?from=goals&new=1`);
	}

	function paceWords(x: GalleryGoal): string {
		const m = x.milestone;
		if (!m || m.budgetKind === 'none' || !m.budgetTarget) return '';
		const head = budgetLabel(m, m.progress);
		if (!m.dueDate || !m.startDate) return head;
		const p = pace({ ...m, startDate: m.startDate }, m.progress, today);
		if (!p) return head;
		const lag = -p.delta;
		if (lag <= 0) return `${head} · в темпе`;
		if (lag < m.budgetTarget * 0.1) return `${head} · чуть отстаёшь`;
		return `${head} · отстаёшь на ${m.budgetKind === 'sessions' ? `${Math.round(lag)} зан.` : amountLabel(lag, m.budgetUnit)}`;
	}
	const share = (x: GalleryGoal) => (x.milestone?.budgetTarget ? Math.min(100, (x.milestone.progress / x.milestone.budgetTarget) * 100) : 0);
	const goalsWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'цель' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'цели' : 'целей'}`;
</script>

<svelte:head><title>Цели</title></svelte:head>

{#snippet starBtn(x: GalleryGoal)}
	<button class="star" class:on={x.focus} aria-pressed={x.focus} aria-label="{x.title}: {x.focus ? 'убрать из фокуса' : 'в фокус'}" onclick={() => star(x)}
		><Star size={20} fill={x.focus ? 'currentColor' : 'none'} /></button
	>
{/snippet}

{#snippet dots(x: GalleryGoal)}
	<span class="dots" aria-label="эта неделя">
		{#each x.week as on, i (i)}{#if days[i] <= today}<span class="dot" class:on></span>{/if}{/each}
	</span>
{/snippet}

{#snippet meta(x: GalleryGoal)}
	{@const d = idleDays(x, today)}
	<span class="meta">
		{#if x.kind === 'area'}
			{x.deeds.length ? `дел ${x.deeds.length}` : 'дел нет'}
		{:else}
			<span class:fade={d !== null && d > 7} class:asleep={d === null || d > 30}>{idleLabel(x, today)}</span>
			{#if x.practices.length}· {practicesWord(x.practices.length)}{/if}
			{#if x.deeds.length}· дел {x.deeds.length}{/if}
			{#if x.focus && paceWords(x)}· {paceWords(x)}{:else if x.volume}· {x.volume}{/if}
		{/if}
	</span>
{/snippet}

{#snippet goalRow(x: GalleryGoal, pale: boolean, hit?: { via: string[]; practiceIds: number[]; deedIds: number[] })}
	{@const open = hit ? true : opened.includes(x.id)}
	<li class="row" class:pale class:open style="--c-light:{colorOf(x.color).light};--c-dark:{colorOf(x.color).dark}">
		<div class="rhead">
			<button class="rlink" aria-expanded={open} onclick={() => toggle(x.id)}>
				<GoalImage kind={x.imageKind} value={x.imageValue} color={x.color} title={x.title} size={28} soft />
				<span class="rtext">
					<span class="rt">{x.title}</span>
					{#if hit?.via.length}<span class="via">через {hit.via.join(', ')}</span>{:else}{@render meta(x)}{/if}
				</span>
				{#if x.kind !== 'area' && !x.archivedAt}{@render dots(x)}{/if}
			</button>
			{#if x.kind !== 'area' && !x.archivedAt}{@render starBtn(x)}{/if}
		</div>
		{#if open}
			<div class="inside">
				{#if x.milestone}
					<p class="ms"><Flag size={13} /><span class="mt">{x.milestone.title}</span>{#if x.milestone.dueDate}<span class="due">· {remaining(x.milestone.dueDate, today)}</span>{/if}</p>
					{#if x.milestone.budgetKind !== 'none' && x.milestone.budgetTarget}<span class="bar"><span style="width:{share(x)}%"></span></span>{/if}
				{/if}
				{#if x.practices.length}
					<ul class="items">
						{#each x.practices as p (p.id)}
							<li class:hl={hit?.practiceIds.includes(p.id)}>
								<a class="obj item" href="/settings/practice/{p.id}?from=goals"><span class="it">{p.title}</span>{#if p.format}<span class="fmt">{p.format}</span>{/if}<ChevronRight size={16} /></a>
							</li>
						{/each}
					</ul>
				{/if}
				{#if x.deeds.length}
					<ul class="items">
						{#each x.deeds as st (st.id)}
							<li class:hl={hit?.deedIds.includes(st.id)}>
								<button class="item" onclick={() => (deed = st)}><ListChecks size={15} /><span class="it">{st.title}</span>{#if st.plannedDate || st.dueDate}<span class="fmt">{st.dueDate ? `до ${st.dueDate.slice(8)}.${st.dueDate.slice(5, 7)}` : `${st.plannedDate!.slice(8)}.${st.plannedDate!.slice(5, 7)}`}</span>{/if}</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if !x.practices.length && !x.deeds.length}<p class="hint">Практик и дел пока нет.</p>{/if}
				<a class="obj tolink" href="/settings/goal/{x.id}?from=goals">Экран цели<ArrowRight size={16} /></a>
			</div>
		{/if}
	</li>
{/snippet}

<main>
	<TopBar help="goals" title="Цели" onAdd={() => capture.show()} menu={[{ label: 'Все практики', icon: LayoutGrid, href: '/?tab=all&from=goals' }]}>
		{#snippet actions()}
			<button class="icon" aria-label="Новая цель" title="Новая цель" onclick={newGoal}><CirclePlus size={22} /></button>
		{/snippet}
	</TopBar>

	{#if error}<p class="note" role="alert">{error}</p>{/if}

	{#if g}
		{#if !everything.length && !g.path.length}
			<div class="empty-state">
				<p>Создай первую цель.</p>
				<button class="primary" onclick={newGoal}>Новая цель</button>
			</div>
		{:else}
			<div class="finder">
				<label class="searchbox">
					<Search size={18} />
					<input type="search" placeholder="Найти цель, практику или дело" aria-label="Поиск целей" bind:value={query} autocomplete="off" autocorrect="off" spellcheck="false" />
					{#if query}<button class="clear" aria-label="Очистить" onclick={() => (query = '')}><X size={16} /></button>{/if}
				</label>
				{#if !hits}
					<div class="chips" role="radiogroup" aria-label="Группировать">
						{#each GROUPINGS as x (x.key)}
							<button role="radio" aria-checked={by === x.key} class:on={by === x.key} onclick={() => setBy(x.key)}>{x.label}</button>
						{/each}
					</div>
					<label class="sortline">
						<span>Порядок</span>
						<select value={sortBy} onchange={(e) => setSort(e.currentTarget.value as SortBy)}>
							{#each SORTS as x (x.key)}<option value={x.key}>{x.label}</option>{/each}
						</select>
					</label>
				{/if}
			</div>

			{#if hits}
				<section>
					<h2>Найдено {hits.length ? goalsWord(hits.length) : 'ничего'}</h2>
					{#if hits.length}
						<ul class="rows">
							{#each hits as h (h.goal.id)}{@render goalRow(h.goal, !!h.goal.archivedAt, h)}{/each}
						</ul>
					{:else}
						<p class="hint">Ищу по названию цели, «зачем», майлстону, практикам и открытым делам.</p>
					{/if}
				</section>
			{:else}
				{#if by === 'plan' && !focus.length}
					<p class="hint top">Отметь ☆ у одной–{appNum('goals.focus_max')} целей — они встанут наверх, ради них и планируется неделя.</p>
				{/if}
				{#each groups as gr (gr.key)}
					{@const isFolded = folded.includes(`${by}:${gr.key}`)}
					<section>
						<button class="ghead" class:pale={gr.pale} aria-expanded={!isFolded} onclick={() => fold(gr.key)}>
							<span class="chev" class:open={!isFolded}><ChevronRight size={14} /></span>
							{#if gr.color}<span class="cdot" style="--c:{colorOf(gr.color).light}"></span>{/if}
							<span>{gr.title}{by === 'plan' && gr.key === 'week' && g.template ? ` · ${g.template}` : ''}</span>
							<span class="n">{gr.goals.length}</span>
						</button>
						{#if !isFolded}
							<ul class="rows">
								{#each gr.goals as x (x.id)}{@render goalRow(x, !!gr.pale)}{/each}
							</ul>
						{/if}
					</section>
				{/each}
			{/if}
			<!-- #27: «Все практики» left the tab bar; it is also here, at the end -->
			<a class="obj allrow" href="/?tab=all&from=goals"><LayoutGrid size={18} />Все практики<ChevronRight size={18} /></a>
		{/if}
	{:else if !error}
		<p class="note">Загрузка…</p>
	{/if}
</main>

{#if replacing}
	{@const x = replacing}
	<div class="backdrop" role="presentation" onclick={() => (replacing = null)}></div>
	<div class="sheet" role="dialog" aria-label="Какую цель снять с фокуса">
		<p class="q">В фокусе уже {appNum('goals.focus_max')} — какую снять, чтобы поставить «{x.title}»?</p>
		<ul class="rows">
			{#each focus as f (f.id)}
				<li class="row">
					<button class="rlink pickout" onclick={() => star(x, f)}>
						<GoalImage kind={f.imageKind} value={f.imageValue} color={f.color} title={f.title} size={26} soft />
						<span class="rt">{f.title}</span>
					</button>
				</li>
			{/each}
		</ul>
		<button class="cancel" onclick={() => (replacing = null)}>Отмена</button>
	</div>
{/if}

{#if deed}
	<DeedSheet
		step={deed}
		practices={everything.find((x) => x.id === deed!.goalId)?.practices.map((p) => ({ id: p.id, title: p.title })) ?? []}
		onSave={saveDeed}
		onRemove={removeDeed}
		onDone={deedDone}
		onClose={closeDeed}
	/>
{/if}

<QuickCapture bind:this={capture} />

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px 16px;
	}
	section {
		margin: 0 0 18px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 8px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	@media (prefers-color-scheme: dark) {
		.row {
			--c: var(--c-dark);
		}
	}
	.ms {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 14px;
		min-width: 0;
	}
	.ms :global(svg) {
		flex: none;
	}
	.mt {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.due {
		flex: none;
		color: var(--muted);
	}
	.bar {
		display: block;
		height: 4px;
		border-radius: 2px;
		background: var(--bg);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--c);
	}
	.rows {
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
	}
	.row {
		--c: var(--c-light);
		position: relative;
		display: flex;
		align-items: center;
	}
	.row + .row {
		border-top: 1px solid var(--line);
	}
	.row.pale {
		opacity: 0.6;
	}
	.rlink {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 52px;
		padding: 4px 4px 4px 12px;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.row {
		flex-direction: column;
		align-items: stretch;
	}
	.rhead {
		display: flex;
		align-items: center;
	}
	.rtext {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.meta,
	.via {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		color: var(--muted);
	}
	.via {
		color: var(--text);
	}
	.fade {
		color: var(--text);
	}
	.asleep {
		font-style: italic;
	}
	.inside {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 12px 12px 50px;
	}
	.inside .ms {
		margin: 0;
	}
	.items {
		border-radius: 10px;
		background: var(--bg);
		overflow: hidden;
	}
	.items li + li {
		border-top: 1px solid var(--line);
	}
	.items li.hl {
		background: color-mix(in srgb, var(--c) 18%, transparent);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		box-sizing: border-box;
		min-height: 42px;
		padding: 0 10px;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 15px;
		text-align: left;
		cursor: pointer;
	}
	.item :global(svg) {
		flex: none;
		color: var(--muted);
	}
	.it {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.fmt {
		flex: none;
		font-size: 12px;
		color: var(--muted);
	}
	.tolink {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		align-self: flex-start;
		min-height: 36px;
		font-size: 14px;
		color: var(--muted);
	}
	.finder {
		position: sticky;
		top: 0;
		z-index: 5;
		margin: 0 -16px 12px;
		padding: 6px 16px 8px;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.searchbox {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 10px;
		border-radius: 12px;
		background: var(--surface);
		color: var(--muted);
	}
	.searchbox input {
		flex: 1;
		min-width: 0;
		border: none;
		outline: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
	}
	.searchbox input::-webkit-search-cancel-button {
		display: none;
	}
	.clear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.chips {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		margin: 0 -16px;
		padding: 0 16px;
		scrollbar-width: none;
	}
	.chips button {
		flex: none;
		min-height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.chips button.on {
		border-color: var(--text);
		background: var(--text);
		color: var(--bg);
	}
	.sortline {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		font-size: 13px;
		color: var(--muted);
	}
	.sortline select {
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 13px;
	}
	.ghead {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		min-height: 32px;
		margin: 0 0 6px;
		padding: 0;
		border: none;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: left;
		cursor: pointer;
	}
	.hint.top {
		margin: 0 0 12px;
	}
	.rt {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 16px;
	}
	.dots {
		flex: none;
		display: inline-flex;
		gap: 4px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1.5px solid var(--c);
		box-sizing: border-box;
	}
	.dot.on {
		background: var(--c);
	}
	.star {
		flex: none;
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.star.on {
		color: var(--text);
	}
	.chev {
		display: inline-flex;
		color: var(--muted);
		transition: transform 0.15s;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.cdot {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: var(--c);
	}
	.n {
		margin-left: auto;
		font-size: 13px;
		color: var(--muted);
	}
	.allrow {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 46px;
		padding: 0 12px;
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
	}
	.allrow :global(svg:last-child) {
		margin-left: auto;
		color: var(--muted);
	}
	.hint,
	.note {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}
	.empty-state {
		margin: 40px 0;
		text-align: center;
	}
	.primary {
		min-height: 44px;
		padding: 0 18px;
		border: none;
		border-radius: 12px;
		background: var(--text);
		color: var(--bg);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: rgb(0 0 0 / 0.35);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 21;
		max-width: 560px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px calc(env(safe-area-inset-bottom) + 12px);
		background: var(--bg);
		border-radius: 16px 16px 0 0;
	}
	.q {
		margin: 0;
		font-weight: 600;
	}
	.pickout {
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.cancel {
		min-height: 44px;
		border: none;
		background: none;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
</style>
