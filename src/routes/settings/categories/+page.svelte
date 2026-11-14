<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import TopBar from '#lib/TopBar.svelte';
	import { colorOf, palette, paletteKeys } from '#lib/palette.js';
	import { inPreview, saveOrder, sortable } from '#lib/sortable.js';
	import { settingsApi } from '#lib/settingsApi.js';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Plus from '@lucide/svelte/icons/plus';
	import type { PageProps } from './$types';

	/** Spec 007 C — categories: name and palette colour, order by dragging, archive. */
	let { data }: PageProps = $props();
	let preview = $state<number[] | null>(null);
	let openId = $state<number | null>(null);
	let error = $state<string | undefined>();
	const list = $derived(inPreview(data.categories.filter((c) => !c.archivedAt), preview, (c) => c.id));

	let timers: Record<number, ReturnType<typeof setTimeout>> = {};
	function save(c: { id: number; name: string; color: string }) {
		clearTimeout(timers[c.id]);
		timers[c.id] = setTimeout(async () => {
			try {
				await settingsApi('category', c);
				error = undefined;
				await invalidateAll();
			} catch (e) {
				error = (e as Error).message;
			}
		}, 500);
	}

	async function add() {
		try {
			await settingsApi('category', { name: 'Новая категория', color: paletteKeys[data.categories.length % paletteKeys.length] });
			await invalidateAll();
			openId = data.categories.at(-1)?.id ?? null;
		} catch (e) {
			error = (e as Error).message;
		}
	}
	async function archive(id: number) {
		await settingsApi('archive', { kind: 'category', id });
		openId = null;
		await invalidateAll();
	}
	onMount(() => {
		if (page.url.searchParams.get('new')) add();
	});
</script>

<svelte:head><title>Категории · Настройки</title></svelte:head>

<main>
	<TopBar title="Категории" back={{ label: 'Настройки', href: '/settings' }}>
		{#snippet actions()}<button class="icon" aria-label="Добавить категорию" title="Добавить" onclick={add}><Plus size={22} /></button>{/snippet}
	</TopBar>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<ul
		class="list"
		use:sortable={{
			preview: (ids) => (preview = ids),
			drop: async (ids) => {
				preview = ids;
				await saveOrder('category', ids).catch(() => (error = 'Порядок не сохранился'));
				await invalidateAll();
				preview = null;
			}
		}}
	>
		{#each list as c (c.id)}
			<li data-id={c.id}>
				<div class="row">
					<button class="main" aria-expanded={openId === c.id} onclick={() => (openId = openId === c.id ? null : c.id)}>
						<span class="dot" style="--c:{colorOf(c.color).light}"></span>{c.name}
					</button>
					<button class="handle" data-handle aria-label="{c.name}: перетащить" title="Перетащить"><GripVertical size={20} /></button>
				</div>
				{#if openId === c.id}
					<div class="edit">
						<label>Название <input value={c.name} oninput={(e) => save({ id: c.id, name: e.currentTarget.value, color: c.color })} /></label>
						<div class="swatches" role="radiogroup" aria-label="Цвет">
							{#each paletteKeys as k (k)}
								<button
									class="swatch"
									class:on={c.color === k}
									role="radio"
									aria-checked={c.color === k}
									aria-label={palette[k].name}
									title={palette[k].name}
									style="--c:{palette[k].light};--cd:{palette[k].dark}"
									onclick={() => save({ id: c.id, name: c.name, color: k })}
								></button>
							{/each}
						</div>
						<button class="quiet" onclick={() => archive(c.id)}>В архив</button>
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
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.swatch {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		border: 3px solid transparent;
		background: var(--c);
		cursor: pointer;
	}
	@media (prefers-color-scheme: dark) {
		.swatch {
			background: var(--cd);
		}
	}
	.swatch.on {
		border-color: var(--text);
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 4px;
		background: var(--c);
		flex: none;
	}
</style>
