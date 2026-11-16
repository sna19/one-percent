<script lang="ts" generics="P extends { id: number; title: string }">
	import type { Snippet } from 'svelte';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import Tree from './Tree.svelte';
	import { filterTree, type TreeCategory, type TreeGoal } from './tree.js';

	/**
	 * #25 — the practice navigator: one look everywhere a practice or goal is shown as a list or picked —
	 * category (colour) › goal › practice in the settings order, with search (opens the matching branches) and
	 * filter chips. Modes:
	 *   view — rows come from the screen (`practice` snippet): a tap opens the practice;
	 *   one — a tap on a practice picks it (`onPick`);
	 *   goal — the tree down to goals only, a tap picks the goal (`onPickGoal`);
	 *   many — boxes on practices, a box on a goal takes all its practices, a counter (`selected`).
	 */
	interface Chip {
		key: string;
		label: string;
		keep: (p: P, g: TreeGoal<P>) => boolean;
	}
	interface Props {
		tree: TreeCategory<P>[];
		/** what is folded is remembered per place */
		storageKey: string;
		mode?: 'view' | 'one' | 'goal' | 'many';
		/** filter chips that make sense here, e.g. «В плане недели», «★ Рекомендовать», «В фокусе» */
		chips?: Chip[];
		/** «Архив» chip: the archived part of the tree, shown instead while the chip is on */
		archived?: TreeCategory<P>[];
		/** hide the search field (very short lists) */
		search?: boolean;
		practice?: Snippet<[P, TreeGoal<P>, TreeCategory<P>]>;
		onPick?: (p: P, g: TreeGoal<P>) => void;
		onPickGoal?: (g: TreeGoal<P>) => void;
		selected?: number[];
		/** small grey text after a practice in the picking modes, e.g. «в плане» */
		note?: (p: P) => string;
		boxed?: boolean;
		goalHref?: (g: TreeGoal<P>) => string;
		goalLead?: Snippet<[TreeGoal<P>, TreeCategory<P>]>;
		goalExtra?: Snippet<[TreeGoal<P>, TreeCategory<P>]>;
		afterPractices?: Snippet<[TreeGoal<P>, TreeCategory<P>]>;
		afterGoals?: Snippet<[TreeCategory<P>]>;
		dragging?: { kind: 'practice' | 'goal'; id: number } | null;
		root?: HTMLElement;
	}
	let {
		tree,
		storageKey,
		mode = 'view',
		chips = [],
		archived,
		search = true,
		practice,
		onPick,
		onPickGoal,
		selected = $bindable([]),
		note,
		boxed = false,
		goalHref,
		goalLead,
		goalExtra,
		afterPractices,
		afterGoals,
		dragging = null,
		root = $bindable()
	}: Props = $props();

	let query = $state('');
	let on = $state<string[]>([]);
	let showArchive = $state(false);
	let inner: Tree<P> | undefined = $state();

	const active = $derived(chips.filter((c) => on.includes(c.key)));
	const filtering = $derived(!!query.trim() || active.length > 0 || showArchive);
	const shown = $derived(
		filterTree(showArchive && archived ? archived : tree, { query, keep: active.map((c) => c.keep), goalsOnly: mode === 'goal' })
	);
	const count = $derived(shown.reduce((n, c) => n + (mode === 'goal' ? c.goals.length : c.goals.reduce((m, g) => m + g.practices.length, 0)), 0));

	export const collapseAll = () => inner?.collapseAll();
	export const expandAll = () => inner?.expandAll();

	const isSel = (id: number) => selected.includes(id);
	function toggle(id: number) {
		selected = isSel(id) ? selected.filter((x) => x !== id) : [...selected, id];
	}
	function toggleGoal(g: TreeGoal<P>) {
		const ids = g.practices.map((p) => p.id);
		const all = ids.every(isSel);
		selected = all ? selected.filter((x) => !ids.includes(x)) : [...new Set([...selected, ...ids])];
	}
</script>

{#snippet pickRow(p: P, g: TreeGoal<P>)}
	{#if mode === 'many'}
		<label class="row">
			<input type="checkbox" checked={isSel(p.id)} onchange={() => toggle(p.id)} />
			<span class="t">{p.title}</span>
			{#if note?.(p)}<em>{note(p)}</em>{/if}
		</label>
	{:else}
		<button class="row" onclick={() => onPick?.(p, g)}>
			<span class="t">{p.title}</span>
			{#if note?.(p)}<em>{note(p)}</em>{/if}
		</button>
	{/if}
{/snippet}

{#snippet goalBox(g: TreeGoal<P>, c: TreeCategory<P>)}
	{#if mode === 'many' && g.practices.length}
		{@const all = g.practices.every((p) => isSel(p.id))}
		{@const some = !all && g.practices.some((p) => isSel(p.id))}
		<input
			class="gbox"
			type="checkbox"
			checked={all}
			indeterminate={some}
			aria-label="{g.title}: все практики"
			onchange={() => toggleGoal(g)}
		/>
	{/if}
	{@render goalLead?.(g, c)}
{/snippet}

<div class="nav" class:filtering>
	{#if search || chips.length || archived}
		<div class="tools">
			{#if search}
				<label class="search">
					<Search size={16} />
					<input type="search" bind:value={query} placeholder="Найти" aria-label="Поиск по названию" enterkeyhint="search" />
					{#if query}<button class="clear" aria-label="Очистить поиск" onclick={() => (query = '')}><X size={16} /></button>{/if}
				</label>
			{/if}
			{#if chips.length || archived}
				<div class="chips" role="group" aria-label="Фильтры">
					{#each chips as c (c.key)}
						<button class:on={on.includes(c.key)} aria-pressed={on.includes(c.key)} onclick={() => (on = on.includes(c.key) ? on.filter((k) => k !== c.key) : [...on, c.key])}
							>{c.label}</button
						>
					{/each}
					{#if archived}
						<button class:on={showArchive} aria-pressed={showArchive} onclick={() => (showArchive = !showArchive)}>Архив</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
	{#if mode === 'many'}<p class="counter">Выбрано: {selected.length}</p>{/if}

	{#if !shown.length}
		<p class="empty">{filtering ? 'Ничего не нашлось' : 'Пока пусто'}</p>
	{:else}
		<Tree
			bind:this={inner}
			tree={shown}
			{storageKey}
			{boxed}
			{goalHref}
			goalLead={mode === 'many' || goalLead ? goalBox : undefined}
			{goalExtra}
			afterPractices={filtering ? undefined : afterPractices}
			afterGoals={filtering ? undefined : afterGoals}
			{dragging}
			bind:root
			forceOpen={filtering}
			goalsOnly={mode === 'goal'}
			onGoal={mode === 'goal' ? onPickGoal : undefined}
			practice={mode === 'view' && practice ? practice : pickRow}
		/>
		{#if filtering}<p class="counter">{mode === 'goal' ? 'Целей' : 'Практик'}: {count}</p>{/if}
	{/if}
</div>

<style>
	/* the order is set on the whole tree: while it is filtered, drag handles are hidden */
	.nav.filtering :global(.handle) {
		display: none;
	}
	.tools {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 4px 0 4px;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 10px;
		min-height: 40px;
		border-radius: 10px;
		background: var(--surface);
		color: var(--muted);
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		outline: none;
	}
	.clear {
		display: inline-flex;
		border: none;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.chips {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.chips button {
		flex: none;
		min-height: 32px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.chips button.on {
		background: var(--text);
		border-color: var(--text);
		color: var(--bg);
	}
	.counter,
	.empty {
		margin: 6px 0;
		font-size: 13px;
		color: var(--muted);
	}
	.empty {
		text-align: center;
		margin: 20px 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 44px;
		padding: 0 8px 0 40px;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		text-align: left;
		cursor: pointer;
	}
	.row input {
		width: 20px;
		height: 20px;
		margin: 0;
	}
	.row .t {
		flex: 1;
		min-width: 0;
	}
	.row em {
		font-style: normal;
		font-size: 12px;
		color: var(--muted);
	}
	.gbox {
		width: 20px;
		height: 20px;
		margin: 0 6px 0 0;
	}
</style>
