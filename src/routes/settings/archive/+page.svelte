<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import TopBar from '#lib/TopBar.svelte';
	import { settingsApi } from '#lib/settingsApi.js';
	import type { PageProps } from './$types';

	/** Spec 007 C — everything archived, with «Вернуть». History (marks, notes) is kept while archived. */
	let { data }: PageProps = $props();
	const items = $derived([
		...data.categories.filter((c) => c.archivedAt).map((c) => ({ kind: 'category', id: c.id, title: c.name, what: 'категория' })),
		...data.goals.filter((g) => g.archivedAt).map((g) => ({ kind: 'goal', id: g.id, title: g.title, what: 'цель' })),
		...data.practices.filter((p) => p.archivedAt).map((p) => ({ kind: 'practice', id: p.id, title: p.title, what: 'практика' })),
		...data.formats.filter((f) => f.archivedAt).map((f) => ({ kind: 'format', id: f.id, title: f.name, what: 'формат' })),
		...data.templates.filter((t) => t.archivedAt).map((t) => ({ kind: 'template', id: t.id, title: t.name, what: 'шаблон недели' }))
	]);
	async function restore(kind: string, id: number) {
		await settingsApi('restore', { kind, id });
		await invalidateAll();
	}
</script>

<svelte:head><title>Архив · Настройки</title></svelte:head>

<main>
	<TopBar title="Архив" back={{ label: 'Настройки', href: '/settings' }} />
	<ul class="list">
		{#each items as a (a.kind + a.id)}
			<li class="row">
				<span class="main static">{a.title}<span class="meta">{a.what}</span></span>
				<button class="quiet restore" onclick={() => restore(a.kind, a.id)}>Вернуть</button>
			</li>
		{:else}
			<li class="row"><span class="main static empty">Архив пуст</span></li>
		{/each}
	</ul>
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px calc(env(safe-area-inset-bottom) + 32px);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
	}
	.list > li + li {
		border-top: 1px solid var(--line);
	}
	.row {
		display: flex;
		align-items: center;
	}
	.main {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		padding: 0 14px;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		text-align: left;
		cursor: pointer;
	}
	.quiet {
		align-self: flex-start;
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: none;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
	:global(li.dragging) {
		background: var(--bg);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
		position: relative;
		z-index: 1;
	}
	.static {
		cursor: default;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 0;
		padding: 8px 14px;
	}
	.meta {
		color: var(--muted);
		font-size: 13px;
	}
	.empty {
		color: var(--muted);
	}
	.restore {
		margin-right: 10px;
	}
</style>
