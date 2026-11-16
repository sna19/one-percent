<script lang="ts">
	import { page } from '$app/state';
	import { backFrom } from '#lib/back.js';
	import { goto } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import TopBar from '#lib/TopBar.svelte';
	import { autosaver } from '#lib/autosave.svelte.js';
	import Archive from '@lucide/svelte/icons/archive';
	import Flag from '@lucide/svelte/icons/flag';
	import GoalImage from '#lib/GoalImage.svelte';
	import GoalImagePicker from '#lib/GoalImagePicker.svelte';
	import { onMount } from 'svelte';
	import NoteView from '#lib/NoteView.svelte';
	import MilestoneForm from '#lib/milestone/MilestoneForm.svelte';
	import MilestoneCheck from '#lib/milestone/MilestoneCheck.svelte';
	import { amountLabel, budgetLabel, pace, remaining, type MilestoneView } from '#lib/milestones.js';
	import { todayStr } from '#lib/dates.js';
	import { dayTitle } from '#lib/today.js';
	import type { PageProps } from './$types';

	/** Spec 007 C — a goal on its own screen; every change saves itself. */
	let { data }: PageProps = $props();
	const g0 = untrack(() => data.goal);

	let title = $state(g0.title);
	let categoryId = $state(g0.categoryId);
	let direction = $state(g0.direction);
	// Spec 009: the old text field became a milestone (migration 0008); it is sent unchanged
	const milestoneText = g0.milestoneText;

	const saver = autosaver('goal');
	// Spec 013 A: the goal's picture
	let imageKind = $state(g0.imageKind);
	let imageValue = $state(g0.imageValue);
	let picking = $state(false);
	const changed = () => saver.save({ id: g0.id, title, categoryId, direction, milestoneText, imageKind, imageValue });
	const catColor = $derived(data.categories.find((c) => c.id === categoryId)?.color ?? 'slate');

	// Spec 009 D — the milestone blocks, loaded with the device's today
	type GoalMs = {
		open: MilestoneView | null;
		progress: number;
		shares: { practiceId: number; title: string; value: number }[];
		history: MilestoneView[];
		units: string[];
	};
	const today = todayStr();
	let ms = $state<GoalMs | null>(null);
	let editing = $state<'new' | 'edit' | null>(null);
	let checking = $state(false);
	async function loadMs() {
		const r = await fetch(`/api/milestones?goalId=${g0.id}&today=${today}`).catch(() => undefined);
		if (r?.ok) ms = await r.json();
	}
	onMount(async () => {
		await loadMs();
		if (page.url.searchParams.get('new') && !ms?.open) editing = 'new';
	});
	const p = $derived(ms?.open ? pace(ms.open, ms.progress, today) : null);
	const STATUS: Record<string, string> = { achieved: 'достигнут', missed: 'не достигнут', dropped: 'отменён' };
	const fmtDate = (d: string) => dayTitle(d.slice(0, 10));
	function paceLine(m: MilestoneView, done: number): string {
		const pc = pace(m, done, today);
		if (!pc) return '';
		if (m.budgetKind === 'none') return '';
		const x = Math.abs(pc.delta);
		const xs = m.budgetKind === 'sessions' ? `${Math.round(x)} зан.` : amountLabel(x, m.budgetUnit);
		if (x < (m.budgetTarget ?? 0) * 0.02) return 'идёшь в темпе';
		return pc.delta > 0 ? `опережаешь на ${xs}` : `отстаёшь на ${xs}`;
	}
	onDestroy(() => saver.flush());

	const categories = $derived(data.categories.filter((c) => !c.archivedAt || c.id === g0.categoryId));
	const practices = $derived(data.practices.filter((p) => p.goalId === g0.id && !p.archivedAt));

	async function archive() {
		await saver.flush();
		await fetch('/api/settings/archive', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ kind: 'goal', id: g0.id })
		});
		goto('/settings');
	}
</script>

<svelte:head><title>{title} · Настройки</title></svelte:head>

<main>
	<TopBar help="goal" title={title || 'Цель'} back={page.url.searchParams.get('from') ? backFrom(page.url.searchParams) : { label: 'Настройки', href: '/settings' }} menu={[{ label: 'В архив', icon: Archive, onclick: archive }]} />
	<p class="status" aria-live="polite">
		{saver.state.status === 'saving' ? 'Сохраняю…' : saver.state.status === 'saved' ? 'Сохранено' : saver.state.status === 'error' ? saver.state.message : ''}
	</p>

	<button class="image" onclick={() => (picking = true)} aria-label="Образ цели: изменить">
		<GoalImage kind={imageKind} value={imageValue} color={catColor} {title} size={52} />
		<span>Образ — изменить</span>
	</button>
	{#if picking}
		<GoalImagePicker
			kind={imageKind}
			value={imageValue}
			color={catColor}
			{title}
			onPick={(k, v) => {
				imageKind = k;
				imageValue = v;
				picking = false;
				changed();
			}}
			onClose={() => (picking = false)}
		/>
	{/if}

	<div class="card">
		<label>Название <input bind:value={title} oninput={changed} /></label>
		<label
			>Категория
			<select bind:value={categoryId} onchange={changed}>
				{#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</label>
		<label>Направление — зачем <textarea bind:value={direction} oninput={changed} rows="2"></textarea></label>
	</div>

	<h2 class="with-icon"><Flag size={14} />Майлстон</h2>
	{#if editing}
		<MilestoneForm
			goalId={g0.id}
			m={editing === 'edit' ? ms?.open : null}
			units={ms?.units ?? []}
			{today}
			onDone={async () => {
				editing = null;
				await loadMs();
			}}
			onCancel={() => (editing = null)}
		/>
	{:else if ms?.open}
		{@const m = ms.open}
		<div class="card ms">
			<p class="ms-title">{m.title}</p>
			{#if m.criterion}<div class="crit"><NoteView doc={m.criterion} readonly /></div>{/if}
			<p class="muted">
				{m.dueDate ? `Срок: ${fmtDate(m.dueDate)} · ${remaining(m.dueDate, today)}` : 'Без срока'}
			</p>
			{#if m.budgetKind !== 'none' && m.budgetTarget}
				<div class="bar" role="img" aria-label="Прогресс: {budgetLabel(m, ms.progress)}">
					<span class="fill" style="width:{Math.min(100, (ms.progress / m.budgetTarget) * 100)}%"></span>
					{#if p}<span class="mark" style="left:{Math.min(100, p.timeShare * 100)}%" title="ожидаемое к сегодня"></span>{/if}
				</div>
				<p class="muted">{budgetLabel(m, ms.progress)}{paceLine(m, ms.progress) ? ` · ${paceLine(m, ms.progress)}` : ''}</p>
			{:else if p}
				<div class="bar time" role="img" aria-label="Прошло времени: {Math.round(p.timeShare * 100)}%">
					<span class="fill" style="width:{p.timeShare * 100}%"></span>
				</div>
				<p class="muted">Прошло {Math.round(p.timeShare * 100)}% времени</p>
			{/if}
			{#if checking}
				<MilestoneCheck
					{m}
					{today}
					from="settings"
					onChanged={async () => {
						checking = false;
						await loadMs();
					}}
				/>
			{:else}
				<div class="ms-actions">
					<button onclick={() => (editing = 'edit')}>Изменить</button>
					<button onclick={() => (checking = true)}>Проверить сейчас</button>
				</div>
			{/if}
		</div>
		{#if ms.shares.length}
			<h2>Вклад практик</h2>
			<ul class="list shares">
				{#each ms.shares as s (s.practiceId)}
					<li>
						<span>{s.title}</span><span class="muted">{m.budgetKind === 'sessions' ? `${s.value} дн` : amountLabel(s.value, m.budgetUnit)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if ms}
		<div class="card">
			<p class="muted">Открытого майлстона нет. Поставь проверяемую точку со сроком — она будет видна на карточках.</p>
			<button class="primary" onclick={() => (editing = 'new')}>Новый майлстон</button>
		</div>
	{/if}

	<h2>Практики цели</h2>
	<ul class="list">
		{#each practices as p (p.id)}
			<li><a href="/settings/practice/{p.id}">{p.title}</a></li>
		{:else}
			<li class="empty">Пока нет</li>
		{/each}
	</ul>

	{#if ms?.history.length}
		<h2>История майлстонов</h2>
		<ul class="list hist">
			{#each ms.history as h (h.id)}
				<li>
					<span>{h.title}<small>{STATUS[h.status]} · {h.closedAt ? fmtDate(h.closedAt) : ''}{h.reviewNote ? ` · ${h.reviewNote}` : ''}</small></span>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px calc(env(safe-area-inset-bottom) + 32px);
	}
	.status {
		min-height: 18px;
		margin: -4px 0 6px;
		font-size: 13px;
		color: var(--muted);
	}
	h2 {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 22px 0 8px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		background: var(--surface);
		border-radius: 12px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
		color: var(--muted);
	}
	input,
	select,
	textarea {
		font: inherit;
		font-size: 17px;
		min-height: 44px;
		padding: 8px 10px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		width: 100%;
		box-sizing: border-box;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
	}
	.list li + li {
		border-top: 1px solid var(--line);
	}
	.list a,
	.empty {
		display: flex;
		align-items: center;
		min-height: 48px;
		padding: 0 14px;
		color: var(--text);
		text-decoration: none;
	}
	.empty {
		color: var(--muted);
	}
	.image {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0 0 12px;
		padding: 0;
		border: none;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.with-icon {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.ms {
		gap: 8px;
	}
	.ms-title {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
	}
	.crit {
		font-size: 15px;
	}
	.muted {
		margin: 0;
		color: var(--muted);
		font-size: 14px;
	}
	/* progress: fill = done, the thin mark = where an even pace would be today */
	.bar {
		position: relative;
		height: 10px;
		border-radius: 5px;
		background: var(--bg);
		overflow: visible;
	}
	.bar .fill {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: 5px;
		background: var(--text);
		opacity: 0.75;
	}
	.bar.time .fill {
		opacity: 0.35;
	}
	.bar .mark {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		margin-left: -1px;
		background: var(--muted);
	}
	.ms-actions {
		display: flex;
		gap: 8px;
	}
	.ms-actions button,
	.primary {
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.primary {
		align-self: flex-start;
		border: none;
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}
	.shares li,
	.hist li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 6px 14px;
	}
	.hist small {
		display: block;
		color: var(--muted);
		font-size: 12px;
	}
</style>
