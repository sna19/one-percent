<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Plus from '@lucide/svelte/icons/plus';
	import CirclePlus from '@lucide/svelte/icons/circle-plus';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import TopBar from '#lib/TopBar.svelte';
	import PracticeTree from '#lib/PracticeTree.svelte';
	import QuickCapture from '#lib/inbox/QuickCapture.svelte';
	import { colorOf } from '#lib/palette.js';
	import { sortable } from '#lib/sortable.js';
	import { treeOfPractices } from '#lib/tree.js';
	import { keyOf, nav } from '#lib/nav.svelte.js';
	import { todayStr, weekStart } from '#lib/dates.js';
	import type { LinkGroup } from '#lib/server/links.js';
	import type { PracticeView } from '#lib/types.js';

	/**
	 * #27 — «Ссылки»: a launcher. The links of practices marked with the link icon, read from their «Всегда»
	 * notes; one tap opens the site. Groups fold and can be reordered (≡ in «Порядок»); a search shows up when
	 * there are many links.
	 */
	let groups = $state<LinkGroup[] | null>(null);
	let error = $state<string | null>(null);
	let reorder = $state(false);
	let preview = $state<number[] | null>(null);
	let query = $state('');
	let adding = $state(false);
	let practices = $state<PracticeView[]>([]);
	let capture: QuickCapture;

	let folded = $state<number[]>([]);
	onMount(async () => {
		try {
			folded = JSON.parse(localStorage.getItem('links-folded') ?? '[]');
		} catch {
			/* private mode */
		}
		await load();
		nav.restore(keyOf(page.url));
	});
	function fold(id: number) {
		folded = folded.includes(id) ? folded.filter((x) => x !== id) : [...folded, id];
		try {
			localStorage.setItem('links-folded', JSON.stringify(folded));
		} catch {
			/* not critical */
		}
	}

	async function load() {
		const r = await fetch('/api/links').catch(() => undefined);
		if (!r?.ok) {
			error = 'Ссылки не загрузились: нет связи с сервером';
			return;
		}
		groups = await r.json();
		error = null;
	}
	async function post(body: Record<string, unknown>) {
		const r = await fetch('/api/links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
		if (!r?.ok) error = 'Не сохранилось: нет связи с сервером';
		return !!r?.ok;
	}

	async function openAdd() {
		const t = todayStr();
		const r = await fetch(`/api/plan?start=${weekStart(t)}&today=${t}`).catch(() => undefined);
		if (r?.ok) practices = (await r.json()).practices;
		adding = true;
	}
	async function add(p: PracticeView) {
		adding = false;
		if (await post({ action: 'set', practiceId: p.id, on: true })) await load();
	}

	const total = $derived((groups ?? []).reduce((n, g) => n + g.links.length, 0));
	const nq = (x: string) => x.toLocaleLowerCase('ru').replace(/ё/g, 'е');
	const domain = (href: string) => {
		try {
			return href.startsWith('mailto:') ? href.slice(7) : new URL(href).hostname.replace(/^www\./, '');
		} catch {
			return href;
		}
	};
	const shown = $derived.by(() => {
		const list = groups ?? [];
		const ordered = preview ? preview.map((id) => list.find((g) => g.practiceId === id)!).filter(Boolean) : list;
		const q = nq(query.trim());
		if (!q) return ordered;
		return ordered
			.map((g) => ({ ...g, links: nq(g.title).includes(q) ? g.links : g.links.filter((l) => nq(l.text).includes(q) || nq(domain(l.href)).includes(q)) }))
			.filter((g) => g.links.length);
	});
	const notIn = $derived(treeOfPractices(practices.filter((p) => !p.inLinks)));
</script>

<svelte:head><title>Ссылки</title></svelte:head>

<main>
	<TopBar help="links" title="Ссылки" onAdd={() => capture.show()} menu={[{ label: 'Все практики', icon: LayoutGrid, href: '/?tab=all&from=links' }]}>
		{#snippet actions()}
			{#if groups?.length}
				<button class="icon" class:on={reorder} aria-pressed={reorder} aria-label="Порядок групп" title="Порядок" onclick={() => (reorder = !reorder)}><GripVertical size={22} /></button>
			{/if}
			<button class="icon" aria-label="Добавить практику" title="Добавить" onclick={openAdd}><CirclePlus size={22} /></button>
		{/snippet}
	</TopBar>

	{#if error}<p class="note" role="alert">{error}</p>{/if}

	{#if groups && !groups.length}
		<div class="empty">
			<p>Отметь практику иконкой ссылки — её ссылки из заметки «Всегда» появятся здесь.</p>
			<button class="primary" onclick={openAdd}><Plus size={18} />Добавить</button>
		</div>
	{:else if groups}
		{#if total > 10 && !reorder}
			<input class="search" type="search" bind:value={query} placeholder="Найти ссылку или сайт" aria-label="Поиск по ссылкам" />
		{/if}
		{#if reorder}<div class="reorder-hint"><span>Перетаскивайте группы за ≡</span><button onclick={() => (reorder = false)}>Готово</button></div>{/if}
		<ul
			class="groups"
			use:sortable={{
				preview: (ids) => (preview = ids),
				drop: async (ids) => {
					preview = ids;
					if (await post({ action: 'order', ids })) await load();
					preview = null;
				}
			}}
		>
			{#each shown as g (g.practiceId)}
				{@const open = reorder ? false : query.trim() ? true : !folded.includes(g.practiceId)}
				<li class="group" data-id={g.practiceId} style="--c:{colorOf(g.color).light}">
					<div class="ghead">
						{#if !reorder}
							<button class="chev" class:open aria-expanded={open} aria-label="{g.title}: {open ? 'свернуть' : 'развернуть'}" onclick={() => fold(g.practiceId)}
								><ChevronRight size={16} /></button
							>
						{/if}
						<span class="cdot"></span>
						<a class="obj gname" href="/settings/practice/{g.practiceId}?from=links">{g.title}</a>
						<span class="n">{g.links.length}</span>
						{#if reorder}<button class="handle" data-handle aria-label="{g.title}: перетащить"><GripVertical size={20} /></button>{/if}
					</div>
					{#if open}
						{#if g.links.length}
							<ul class="links">
								{#each g.links as l, i (i)}
									<li>
										<a class="link" href={l.href} target="_blank" rel="noopener noreferrer"
											><span class="lt">{l.text}</span><span class="dom">{domain(l.href)}</span></a
										>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="nolinks">В заметке «Всегда» пока нет ссылок.</p>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{:else if !error}
		<p class="note">Загрузка…</p>
	{/if}
</main>

{#if adding}
	<div class="backdrop" role="presentation" onclick={() => (adding = false)}></div>
	<div class="sheet" role="dialog" aria-label="Добавить в «Ссылки»">
		<header><span class="st">Добавить в «Ссылки»</span><button class="done" onclick={() => (adding = false)}>Готово</button></header>
		<div class="sbody"><PracticeTree tree={notIn} storageKey="links-add-tree" mode="one" onPick={(p) => add(p)} /></div>
	</div>
{/if}

<QuickCapture bind:this={capture} />

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px 16px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.search {
		width: 100%;
		box-sizing: border-box;
		min-height: 40px;
		margin: 0 0 10px;
		padding: 0 12px;
		border: none;
		border-radius: 10px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 16px;
	}
	.groups {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.group {
		border-radius: 12px;
		background: var(--surface);
		overflow: hidden;
	}
	:global(.groups.sorting) .group {
		transition: transform 0.15s;
	}
	.ghead {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 46px;
		padding: 0 8px 0 4px;
		border-left: 4px solid var(--c);
	}
	.chev {
		width: 36px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--muted);
		cursor: pointer;
		transition: transform 0.15s;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.cdot {
		display: none;
	}
	.gname {
		flex: 1;
		min-width: 0;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.n {
		font-size: 13px;
		color: var(--muted);
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
	.links li + li,
	.links li:first-child {
		border-top: 1px solid var(--line);
	}
	.link {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-height: 44px;
		padding: 11px 14px;
		box-sizing: border-box;
		color: var(--link);
		text-decoration: none;
	}
	.lt {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dom {
		flex: none;
		max-width: 40%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: var(--muted);
	}
	.nolinks {
		margin: 0;
		padding: 10px 14px;
		border-top: 1px solid var(--line);
		font-size: 14px;
		color: var(--muted);
	}
	.reorder-hint {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 0 0 10px;
		font-size: 14px;
		color: var(--muted);
	}
	.reorder-hint button {
		min-height: 36px;
		padding: 0 12px;
		border: none;
		border-radius: 10px;
		background: var(--text);
		color: var(--bg);
		font: inherit;
		cursor: pointer;
	}
	.empty {
		margin: 40px 8px;
		text-align: center;
		color: var(--muted);
	}
	.primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
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
	.note {
		color: var(--muted);
		text-align: center;
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
		max-height: 80vh;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		padding: 8px 16px calc(env(safe-area-inset-bottom) + 12px);
		background: var(--bg);
		border-radius: 16px 16px 0 0;
	}
	.sheet header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 44px;
	}
	.st {
		font-weight: 700;
	}
	.done {
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.sbody {
		overflow-y: auto;
	}
</style>
