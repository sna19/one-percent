<script lang="ts" generics="P extends { id: number }">
	import { onMount, type Snippet } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { colorOf } from './palette.js';
	import type { TreeCategory, TreeGoal } from './tree.js';

	/**
	 * Spec 007 C, #12 — one tree for settings and for «Сделать что-то ещё»: category (coloured heading)
	 * → goal → practices. Categories and goals fold; what is folded is remembered on this device under
	 * `storageKey`. The rows themselves come from the screen through snippets.
	 * Rows carry data-row / data-id / data-goal / data-cat, so a screen can find drop places in them.
	 */
	interface Props {
		tree: TreeCategory<P>[];
		storageKey: string;
		/** goals in a white box with lines between rows (settings); plain list otherwise */
		boxed?: boolean;
		/** the goal's title is a link (settings); without it a tap on the title folds the goal */
		goalHref?: (g: TreeGoal<P>) => string;
		/** after the goal's title, e.g. a drag handle */
		goalExtra?: Snippet<[TreeGoal<P>, TreeCategory<P>]>;
		/** before the goal's title, e.g. its picture (Spec 013) */
		goalLead?: Snippet<[TreeGoal<P>, TreeCategory<P>]>;
		practice: Snippet<[P, TreeGoal<P>, TreeCategory<P>]>;
		/** last row under a goal's practices, e.g. «+ Практика» */
		afterPractices?: Snippet<[TreeGoal<P>, TreeCategory<P>]>;
		/** last row under a category's goals, e.g. «+ Цель» */
		afterGoals?: Snippet<[TreeCategory<P>]>;
		/** #25: a search or a filter is on — every branch shown open, what is folded is kept for later */
		forceOpen?: boolean;
		/** #25: picking a goal — no practice rows, a tap on a goal picks it */
		goalsOnly?: boolean;
		onGoal?: (g: TreeGoal<P>) => void;
		/** the row being dragged, for its lifted look */
		dragging?: { kind: 'practice' | 'goal'; id: number } | null;
		root?: HTMLElement;
	}
	let {
		tree,
		storageKey,
		boxed = false,
		goalHref,
		goalExtra,
		goalLead,
		practice,
		afterPractices,
		afterGoals,
		dragging = null,
		forceOpen = false,
		goalsOnly = false,
		onGoal,
		root = $bindable()
	}: Props = $props();

	let goals = $state<number[]>([]);
	let cats = $state<number[]>([]);
	onMount(() => {
		try {
			const v = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
			if (Array.isArray(v?.goals)) goals = v.goals.filter(Number.isInteger);
			if (Array.isArray(v?.cats)) cats = v.cats.filter(Number.isInteger);
		} catch {
			/* private mode or bad data: start unfolded */
		}
	});
	function remember() {
		try {
			localStorage.setItem(storageKey, JSON.stringify({ goals, cats }));
		} catch {
			/* not critical */
		}
	}
	const flip = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
	function toggleGoal(id: number) {
		goals = flip(goals, id);
		remember();
	}
	function toggleCat(id: number) {
		cats = flip(cats, id);
		remember();
	}
	export function collapseAll() {
		cats = tree.map((c) => c.id);
		goals = tree.flatMap((c) => c.goals.map((g) => g.id));
		remember();
	}
	export function expandAll() {
		cats = [];
		goals = [];
		remember();
	}
</script>

<div class="tree" class:boxed bind:this={root} class:sorting={!!dragging}>
	{#each tree as c (c.id)}
		{@const catOpen = forceOpen || !cats.includes(c.id)}
		<section>
			<h2 data-row="category" data-cat={c.id}>
				<button class="cat-toggle" aria-expanded={catOpen} aria-label="{c.name}: {catOpen ? 'свернуть' : 'развернуть'}" onclick={() => toggleCat(c.id)}>
					<span class="chev" class:open={catOpen}><ChevronRight size={16} /></span>
					<span class="dot" style="--c:{colorOf(c.color).light}"></span>{c.name}
					{#if !catOpen}<span class="count">{c.goals.length}</span>{/if}
				</button>
			</h2>
			{#if catOpen}
				<ul class="goals">
					{#each c.goals as g (g.id)}
						{@const open = !goalsOnly && (forceOpen || !goals.includes(g.id))}
						<li class="goal" class:dragging={dragging?.kind === 'goal' && dragging.id === g.id}>
							<div class="goal-row" data-row="goal" data-id={g.id} data-goal={g.id} data-cat={c.id}>
								{#if !goalsOnly}
									<button class="chev" class:open aria-label="{g.title}: {open ? 'свернуть' : 'развернуть'}" aria-expanded={open} onclick={() => toggleGoal(g.id)}
										><ChevronRight size={18} /></button
									>
								{/if}
								{@render goalLead?.(g, c)}
								{#if onGoal}
									<button class="goal-title pick" onclick={() => onGoal(g)}>{g.title}</button>
								{:else if goalHref}
									<a class="goal-title" href={goalHref(g)}>{g.title}</a>
								{:else}
									<button class="goal-title" aria-hidden="true" tabindex="-1" onclick={() => toggleGoal(g.id)}>{g.title}</button>
								{/if}
								{#if !goalsOnly}<span class="count">{g.practices.length}</span>{/if}
								{@render goalExtra?.(g, c)}
							</div>
							{#if open}
								<ul class="practices">
									{#each g.practices as p (p.id)}
										<li
											class="practice"
											class:dragging={dragging?.kind === 'practice' && dragging.id === p.id}
											data-row="practice"
											data-id={p.id}
											data-goal={g.id}
											data-cat={c.id}
										>
											{@render practice(p, g, c)}
										</li>
									{/each}
									{#if afterPractices}<li class="after">{@render afterPractices(g, c)}</li>{/if}
								</ul>
							{/if}
						</li>
					{/each}
					{#if afterGoals}<li class="after">{@render afterGoals(c)}</li>{/if}
				</ul>
			{/if}
		</section>
	{/each}
</div>

<style>
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 22px 0 8px;
	}
	.cat-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		margin: -6px 0;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		text-align: left;
		cursor: pointer;
	}
	.cat-toggle .chev {
		width: auto;
		height: auto;
	}
	.cat-toggle .count {
		margin-left: auto;
		text-transform: none;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 4px;
		background: var(--c);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.goal-row {
		display: flex;
		align-items: center;
		min-height: 48px;
		padding-left: 4px;
	}
	.chev {
		flex: none;
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
	.goal-title {
		flex: 1;
		min-width: 0;
		padding: 12px 0;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-weight: 600;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.count {
		color: var(--muted);
		font-size: 13px;
		margin-right: 4px;
	}
	.practices {
		padding-left: 36px;
	}
	/* settings: a white box per category, lines between rows */
	.boxed .goals {
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
	}
	.boxed .goals > li + li,
	.boxed .practice,
	.boxed .practices .after {
		border-top: 1px solid var(--line);
	}
	.boxed .practice {
		display: flex;
		align-items: center;
	}
	/* Today: cards under the goal, with a little air */
	.tree:not(.boxed) .goal-row {
		min-height: 44px;
	}
	.tree:not(.boxed) .practices {
		padding-left: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-bottom: 6px;
	}
	li.dragging {
		background: var(--bg);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
		position: relative;
		z-index: 1;
	}
	.tree.sorting {
		user-select: none;
		-webkit-user-select: none;
	}
</style>
