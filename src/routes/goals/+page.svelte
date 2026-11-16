<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Flag from '@lucide/svelte/icons/flag';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';
	import CirclePlus from '@lucide/svelte/icons/circle-plus';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TopBar from '#lib/TopBar.svelte';
	import GoalImage from '#lib/GoalImage.svelte';
	import QuickCapture from '#lib/inbox/QuickCapture.svelte';
	import { todayStr } from '#lib/dates.js';
	import { remaining } from '#lib/milestones.js';
	import { colorOf } from '#lib/palette.js';
	import { keyOf, nav } from '#lib/nav.svelte.js';
	import { page } from '$app/state';
	import type { Gallery, GalleryGoal } from '#lib/server/goals.js';

	/**
	 * Spec 013 B — «Цели»: every goal in one calm place. A ribbon per category (settings order), big cards with
	 * the picture, «why», milestone, this week and what went in. Only real rewards: time put in and milestones
	 * reached — no points, levels, streaks or red. A tap opens the goal; «‹ Цели» comes back to the same card.
	 */
	const today = todayStr();
	let g = $state<Gallery | null>(null);
	let error = $state<string | null>(null);
	let showPath = $state(false);
	let capture: QuickCapture;
	const ribbons: Record<number, HTMLElement> = {};

	onMount(async () => {
		const r = await fetch(`/api/goals?today=${today}`).catch(() => undefined);
		if (!r?.ok) {
			error = 'Цели не загрузились: нет связи с сервером';
			return;
		}
		g = await r.json();
		// back from a goal: the same ribbon positions and the same scroll
		requestAnimationFrame(() => {
			for (const [id, x] of nav.ribbons) ribbons[id]?.scrollTo({ left: x });
			nav.restore(keyOf(page.url));
		});
	});

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

	const DAYS = ['В', 'П', 'В', 'С', 'Ч', 'П', 'С'];
	const invested = (x: GalleryGoal) =>
		x.invested.kind === 'hours'
			? `${String(Math.round(x.invested.value * 10) / 10).replace('.', ',')} ч`
			: `${x.invested.value} ${x.invested.value % 10 === 1 && x.invested.value % 100 !== 11 ? 'день' : [2, 3, 4].includes(x.invested.value % 10) && ![12, 13, 14].includes(x.invested.value % 100) ? 'дня' : 'дней'}`;
	const share = (m: NonNullable<GalleryGoal['milestone']>) => (m.budgetTarget ? Math.min(100, (m.progress / m.budgetTarget) * 100) : 0);
	const closedOn = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
</script>

<svelte:head><title>Цели</title></svelte:head>

{#snippet card(x: GalleryGoal, past = false)}
	<a class="card" class:past href="/settings/goal/{x.id}?from=goals" style="--c-light:{colorOf(x.color).light};--c-dark:{colorOf(x.color).dark}">
		<GoalImage kind={x.imageKind} value={x.imageValue} color={x.color} title={x.title} size={52} />
		<span class="name">{x.title}</span>
		{#if !past}
			<span class="why" class:empty={!x.why}>{x.why || 'добавь, зачем'}</span>
			<span class="ms" class:empty={!x.milestone}>
				<Flag size={13} />
				{#if x.milestone}<span class="mt">{x.milestone.title}</span>{#if x.milestone.dueDate}<span class="due">· {remaining(x.milestone.dueDate, today)}</span>{/if}{:else}нет майлстона{/if}
			</span>
			{#if x.milestone && x.milestone.budgetKind !== 'none' && x.milestone.budgetTarget}
				<span class="bar"><span style="width:{share(x.milestone)}%"></span></span>
			{/if}
			<span class="dots" class:paused={x.paused} aria-label={x.paused ? 'на паузе по плану' : 'эта неделя'}>
				{#each x.week as on, i (i)}<span class="dot" class:on title={DAYS[i]}></span>{/each}
				{#if x.paused}<small>на паузе</small>{/if}
			</span>
		{:else}
			<span class="why">{closedOn(x.archivedAt)}</span>
		{/if}
		<span class="foot">
			<span>Вложено {invested(x)}</span>
			{#if x.achieved}<span class="ach" aria-label="достигнуто майлстонов: {x.achieved}"><BadgeCheck size={14} />{x.achieved}</span>{/if}
		</span>
	</a>
{/snippet}

<main>
	<TopBar help="goals" title="Цели" onAdd={() => capture.show()}>
		{#snippet actions()}
			<button class="icon" aria-label="Новая цель" title="Новая цель" onclick={newGoal}><CirclePlus size={22} /></button>
		{/snippet}
	</TopBar>

	{#if error}<p class="note" role="alert">{error}</p>{/if}

	{#if g}
		{#if !g.categories.length}
			<div class="empty-state">
				<p>Создай первую цель.</p>
				<button class="primary" onclick={newGoal}>Новая цель</button>
			</div>
		{/if}
		{#each g.categories as c (c.id)}
			<section>
				<h2><span class="cdot" style="--c:{colorOf(c.color).light}"></span>{c.name}<span class="n">{c.goals.length}</span></h2>
				<div class="ribbon" bind:this={ribbons[c.id]} onscroll={(e) => nav.ribbons.set(c.id, e.currentTarget.scrollLeft)}>
					{#each c.goals as x (x.id)}{@render card(x)}{/each}
				</div>
			</section>
		{/each}
		{#if g.path.length}
			<button class="fold" aria-expanded={showPath} onclick={() => (showPath = !showPath)}>
				<ChevronRight size={16} class={showPath ? 'rot' : ''} />Пройденный путь<span class="n">{g.path.length}</span>
			</button>
			{#if showPath}
				<div class="ribbon">
					{#each g.path as x (x.id)}{@render card(x, true)}{/each}
				</div>
			{/if}
		{/if}
	{:else if !error}
		<p class="note">Загрузка…</p>
	{/if}
</main>
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
		gap: 8px;
		margin: 0 0 8px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.cdot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c);
	}
	.n {
		font-weight: 500;
		color: var(--muted);
		margin-left: 4px;
	}
	/* a ribbon to the screen edges: the next card peeks in on the right and the swipe stops on a card */
	.ribbon {
		display: flex;
		gap: 12px;
		margin: 0 -16px;
		padding: 2px 16px 8px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding: 0 16px;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}
	.ribbon::-webkit-scrollbar {
		display: none;
	}
	.card {
		--c: var(--c-light);
		flex: none;
		width: 220px;
		scroll-snap-align: start;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px;
		box-sizing: border-box;
		border-radius: 18px;
		background: var(--surface);
		border-top: 4px solid var(--c);
		color: var(--text);
		text-decoration: none;
		justify-content: flex-start;
	}
	@media (prefers-color-scheme: dark) {
		.card {
			--c: var(--c-dark);
		}
	}
	.card.past {
		opacity: 0.65;
	}
	.name {
		font-size: 18px;
		font-weight: 700;
		line-height: 1.2;
	}
	/* two lines at most; a plain block (a -webkit-box inside the flex card stretched it) */
	.why {
		display: block;
		font-style: italic;
		font-size: 14px;
		line-height: 1.3;
		height: 2.6em;
		overflow: hidden;
	}
	.why.empty,
	.ms.empty {
		color: var(--muted);
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
		height: 6px;
		border-radius: 3px;
		background: var(--bg);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--c);
	}
	.dots {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid var(--c);
		box-sizing: border-box;
	}
	.dot.on {
		background: var(--c);
	}
	.dots.paused .dot {
		opacity: 0.35;
	}
	.dots small {
		margin-left: 4px;
		font-size: 12px;
		color: var(--muted);
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: auto;
		font-size: 13px;
		color: var(--muted);
	}
	.ach {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		color: var(--text);
		font-weight: 600;
	}
	.fold {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		min-height: 44px;
		padding: 0;
		border: none;
		border-top: 1px solid var(--line);
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.fold :global(.rot) {
		transform: rotate(90deg);
	}
	.empty-state {
		margin: 40px 0;
		text-align: center;
	}
	.note {
		color: var(--muted);
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
</style>
