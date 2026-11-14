<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import TopBar from '#lib/TopBar.svelte';
	import { inPreview, saveOrder, sortable } from '#lib/sortable.js';
	import { settingsApi } from '#lib/settingsApi.js';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Plus from '@lucide/svelte/icons/plus';
	import type { PageProps } from './$types';

	/** Spec 007 C — formats: rename, order by dragging, archive. */
	let { data }: PageProps = $props();
	let preview = $state<number[] | null>(null);
	let openId = $state<number | null>(null);
	let error = $state<string | undefined>();
	const list = $derived(inPreview(data.formats.filter((f) => !f.archivedAt), preview, (f) => f.id));
	const usedBy = (id: number) => data.practices.filter((p) => !p.archivedAt && p.formatId === id).length;

	let timers: Record<number, ReturnType<typeof setTimeout>> = {};
	function rename(id: number, name: string) {
		clearTimeout(timers[id]);
		timers[id] = setTimeout(async () => {
			try {
				await settingsApi('format', { id, name });
				error = undefined;
				await invalidateAll();
			} catch (e) {
				error = (e as Error).message;
			}
		}, 500);
	}
	async function add() {
		try {
			await settingsApi('format', { name: 'Новый формат' });
			await invalidateAll();
			openId = data.formats.at(-1)?.id ?? null;
		} catch (e) {
			error = (e as Error).message;
		}
	}
	async function archive(id: number) {
		await settingsApi('archive', { kind: 'format', id });
		openId = null;
		await invalidateAll();
	}
	onMount(() => {
		if (page.url.searchParams.get('new')) add();
	});
</script>

<svelte:head><title>Форматы · Настройки</title></svelte:head>

<main>
	<TopBar title="Форматы" back={{ label: 'Настройки', href: '/settings' }}>
		{#snippet actions()}<button class="icon" aria-label="Добавить формат" title="Добавить" onclick={add}><Plus size={22} /></button>{/snippet}
	</TopBar>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<ul
		class="list"
		use:sortable={{
			preview: (ids) => (preview = ids),
			drop: async (ids) => {
				preview = ids;
				await saveOrder('format', ids).catch(() => (error = 'Порядок не сохранился'));
				await invalidateAll();
				preview = null;
			}
		}}
	>
		{#each list as f (f.id)}
			<li data-id={f.id}>
				<div class="row">
					<button class="main" aria-expanded={openId === f.id} onclick={() => (openId = openId === f.id ? null : f.id)}>
						{f.name}<span class="meta">{usedBy(f.id)}</span>
					</button>
					<button class="handle" data-handle aria-label="{f.name}: перетащить" title="Перетащить"><GripVertical size={20} /></button>
				</div>
				{#if openId === f.id}
					<div class="edit">
						<label>Название <input value={f.name} oninput={(e) => rename(f.id, e.currentTarget.value)} /></label>
						<button class="quiet" onclick={() => archive(f.id)}>В архив</button>
					</div>
				{/if}
			</li>
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
	.handle {
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--muted);
		touch-action: none;
		cursor: grab;
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 4px 14px 14px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
		color: var(--muted);
	}
	input {
		font-size: 17px;
		min-height: 44px;
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
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
	.error {
		background: color-mix(in oklab, #c98a06 18%, var(--surface));
		padding: 10px 14px;
		border-radius: 10px;
	}
	:global(li.dragging) {
		background: var(--bg);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
		position: relative;
		z-index: 1;
	}
	.meta {
		margin-left: auto;
		color: var(--muted);
		font-size: 13px;
	}
</style>
