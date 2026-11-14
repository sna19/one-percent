<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import TopBar from '#lib/TopBar.svelte';
	import { autosaver } from '#lib/autosave.svelte.js';
	import Archive from '@lucide/svelte/icons/archive';
	import type { PageProps } from './$types';

	/** Spec 007 C — a goal on its own screen; every change saves itself. */
	let { data }: PageProps = $props();
	const g0 = untrack(() => data.goal);

	let title = $state(g0.title);
	let categoryId = $state(g0.categoryId);
	let direction = $state(g0.direction);
	let milestoneText = $state(g0.milestoneText);

	const saver = autosaver('goal');
	const changed = () => saver.save({ id: g0.id, title, categoryId, direction, milestoneText });
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
	<TopBar title={title || 'Цель'} back={{ label: 'Настройки', href: '/settings' }} menu={[{ label: 'В архив', icon: Archive, onclick: archive }]} />
	<p class="status" aria-live="polite">
		{saver.state.status === 'saving' ? 'Сохраняю…' : saver.state.status === 'saved' ? 'Сохранено' : saver.state.status === 'error' ? saver.state.message : ''}
	</p>

	<div class="card">
		<label>Название <input bind:value={title} oninput={changed} /></label>
		<label
			>Категория
			<select bind:value={categoryId} onchange={changed}>
				{#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</label>
		<label>Направление — зачем <textarea bind:value={direction} oninput={changed} rows="2"></textarea></label>
		<label>Текущий майлстон <textarea bind:value={milestoneText} oninput={changed} rows="2"></textarea></label>
	</div>

	<h2>Практики цели</h2>
	<ul class="list">
		{#each practices as p (p.id)}
			<li><a href="/settings/practice/{p.id}">{p.title}</a></li>
		{:else}
			<li class="empty">Пока нет</li>
		{/each}
	</ul>
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
</style>
