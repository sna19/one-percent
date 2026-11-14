<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import TopBar from '#lib/TopBar.svelte';
	import { backFrom } from '#lib/back.js';
	import { colorOf } from '#lib/palette.js';
	import { buildTree, goalOrder, moveGoal, movePractice, practiceOrder, type TreeCategory } from '#lib/tree.js';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Archive from '@lucide/svelte/icons/archive';
	import History from '@lucide/svelte/icons/history';
	import type { PageProps } from './$types';

	/** Spec 007 C — settings as a tree: category → goal → practice; each item edits on its own screen. */
	let { data }: PageProps = $props();

	const base = $derived(buildTree(data.categories, data.goals, data.practices));
	let preview = $state<TreeCategory[] | null>(null);
	const tree = $derived(preview ?? base);
	const formatName = (id: number | null) => data.formats.find((f) => f.id === id && !f.archivedAt)?.name;

	let collapsed = $state<number[]>([]);
	const toggleGoal = (id: number) =>
		(collapsed = collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id]);

	let error = $state<string | undefined>();
	let addOpen = $state(false);

	async function api(action: string, body: object) {
		const r = await fetch(`/api/settings/${action}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const j = await r.json().catch(() => ({}));
		if (!r.ok) throw new Error(j.message ?? 'Не сохранилось');
		return j;
	}

	async function newPractice(goalId: number) {
		try {
			const { id } = await api('newPractice', { goalId });
			goto(`/settings/practice/${id}?new=1`);
		} catch (e) {
			error = (e as Error).message;
		}
	}
	async function newGoal(categoryId: number) {
		try {
			const { id } = await api('newGoal', { categoryId });
			goto(`/settings/goal/${id}?new=1`);
		} catch (e) {
			error = (e as Error).message;
		}
	}

	// ── drag inside the tree (≡ handles): order, and moving into another goal or category ──
	let treeEl: HTMLElement;
	let dragging = $state<{ kind: 'practice' | 'goal'; id: number } | null>(null);
	let startTree: TreeCategory[] = [];

	// The dragged row may be re-created in another goal or category, so the move/up listeners
	// live on window for the duration of the drag (a handle's pointer capture would be lost).
	function down(e: PointerEvent, kind: 'practice' | 'goal', id: number) {
		e.preventDefault();
		dragging = { kind, id };
		startTree = base;
		preview = base;
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', up);
	}

	function move(e: PointerEvent) {
		if (!dragging || !preview) return;
		const d = dragging;
		const sel = d.kind === 'practice' ? '[data-row=goal],[data-row=practice]' : '[data-row=category],[data-row=goal]';
		const rows = [...treeEl.querySelectorAll<HTMLElement>(sel)].filter(
			(r) => !(r.dataset.row === d.kind && Number(r.dataset.id) === d.id)
		);
		const above = rows.filter((r) => {
			const b = r.getBoundingClientRect();
			return b.top + b.height / 2 < e.clientY;
		});
		const last = above.at(-1);
		let next = preview;
		if (d.kind === 'practice') {
			const goalId = last ? Number(last.dataset.goal) : preview.find((c) => c.goals.length)?.goals[0].id;
			if (goalId === undefined) return;
			const index = !last || last.dataset.row === 'goal' ? 0 : above.filter((r) => r.dataset.row === 'practice' && Number(r.dataset.goal) === goalId).length;
			next = movePractice(preview, d.id, goalId, index);
		} else {
			const catId = last ? Number(last.dataset.cat) : preview[0]?.id;
			if (catId === undefined) return;
			const index = !last || last.dataset.row === 'category' ? 0 : above.filter((r) => r.dataset.row === 'goal' && Number(r.dataset.cat) === catId).length;
			next = moveGoal(preview, d.id, catId, index);
		}
		if (JSON.stringify(next) !== JSON.stringify(preview)) preview = next;
	}

	async function up() {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
		window.removeEventListener('pointercancel', up);
		if (!dragging || !preview) return;
		const d = dragging;
		const final = preview;
		dragging = null;
		const body: Record<string, unknown> = { practiceOrder: practiceOrder(final), goalOrder: goalOrder(final) };
		if (d.kind === 'practice') {
			const goalId = final.flatMap((c) => c.goals).find((g) => g.practices.some((p) => p.id === d.id))?.id;
			const was = startTree.flatMap((c) => c.goals).find((g) => g.practices.some((p) => p.id === d.id))?.id;
			if (goalId !== undefined && goalId !== was) body.practiceGoal = { id: d.id, goalId };
		} else {
			const catId = final.find((c) => c.goals.some((g) => g.id === d.id))?.id;
			const was = startTree.find((c) => c.goals.some((g) => g.id === d.id))?.id;
			if (catId !== undefined && catId !== was) body.goalCategory = { id: d.id, categoryId: catId };
		}
		try {
			if (JSON.stringify(final) !== JSON.stringify(startTree)) await api('tree', body);
			error = undefined;
		} catch (e) {
			error = (e as Error).message;
		}
		await invalidateAll();
		preview = null;
	}

	const dose = (p: { minDose: number; normDose: number; unit: string }) =>
		p.minDose === p.normDose ? `${p.normDose} ${p.unit}` : `${p.minDose} / ${p.normDose} ${p.unit}`;
	const archivedCount = $derived(
		[...data.categories, ...data.goals, ...data.practices, ...data.formats].filter((x) => x.archivedAt).length
	);
</script>

<svelte:head><title>Настройки · 1%</title></svelte:head>

<main>
	<TopBar
		title="Настройки"
		back={backFrom(page.url.searchParams)}
		menu={[
			{ label: 'Архив', icon: Archive, href: '/settings/archive' },
			{ label: 'Старые настройки', icon: History, href: '/settings/legacy' }
		]}
	>
		{#snippet actions()}
			<button class="icon" aria-label="Добавить" title="Добавить" aria-haspopup="menu" aria-expanded={addOpen} onclick={() => (addOpen = !addOpen)}
				><Plus size={22} /></button
			>
		{/snippet}
	</TopBar>

	{#if addOpen}
		<div class="scrim" role="presentation" onclick={() => (addOpen = false)}></div>
		<ul class="addmenu" role="menu">
			<li role="none"><button role="menuitem" onclick={() => { addOpen = false; const g = tree.flatMap((c) => c.goals)[0]; if (g) newPractice(g.id); else error = 'Сначала создайте цель'; }}>Практика</button></li>
			<li role="none"><button role="menuitem" onclick={() => { addOpen = false; if (tree[0]) newGoal(tree[0].id); else error = 'Сначала создайте категорию'; }}>Цель</button></li>
			<li role="none"><a role="menuitem" href="/settings/categories?new=1">Категория</a></li>
			<li role="none"><a role="menuitem" href="/settings/formats?new=1">Формат</a></li>
		</ul>
	{/if}

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<div class="tree" bind:this={treeEl} class:sorting={!!dragging}>
		{#each tree as c (c.id)}
			<section>
				<h2 data-row="category" data-cat={c.id}><span class="dot" style="--c:{colorOf(c.color).light}"></span>{c.name}</h2>
				<ul class="goals">
					{#each c.goals as g (g.id)}
						{@const open = !collapsed.includes(g.id)}
						<li class="goal" class:dragging={dragging?.kind === 'goal' && dragging.id === g.id}>
							<div class="goal-row" data-row="goal" data-id={g.id} data-goal={g.id} data-cat={c.id}>
								<button class="chev" class:open aria-label="{g.title}: {open ? 'свернуть' : 'развернуть'}" aria-expanded={open} onclick={() => toggleGoal(g.id)}><ChevronRight size={18} /></button>
								<a class="goal-link" href="/settings/goal/{g.id}">{g.title}</a>
								<span class="count">{g.practices.length}</span>
								<button class="handle" aria-label="{g.title}: перетащить" title="Перетащить" onpointerdown={(e) => down(e, 'goal', g.id)}><GripVertical size={20} /></button>
							</div>
							{#if open}
								<ul class="practices">
									{#each g.practices as p (p.id)}
										<li class="practice" class:dragging={dragging?.kind === 'practice' && dragging.id === p.id} data-row="practice" data-id={p.id} data-goal={g.id} data-cat={c.id}>
											<a href="/settings/practice/{p.id}">
												<span class="ptitle">{p.title}</span>
												<span class="meta">{[formatName(p.formatId), dose(p)].filter(Boolean).join(' · ')}</span>
											</a>
											<button class="handle" aria-label="{p.title}: перетащить" title="Перетащить" onpointerdown={(e) => down(e, 'practice', p.id)}><GripVertical size={20} /></button>
										</li>
									{/each}
									<li class="add"><button onclick={() => newPractice(g.id)}><Plus size={16} /> Практика</button></li>
								</ul>
							{/if}
						</li>
					{/each}
					<li class="add"><button onclick={() => newGoal(c.id)}><Plus size={16} /> Цель</button></li>
				</ul>
			</section>
		{/each}
	</div>

	<h2 class="refs-title">Справочники</h2>
	<ul class="refs">
		<li><a href="/settings/categories">Категории<span class="meta">{data.categories.filter((c) => !c.archivedAt).length}</span><ChevronRight size={18} /></a></li>
		<li><a href="/settings/formats">Форматы<span class="meta">{data.formats.filter((f) => !f.archivedAt).length}</span><ChevronRight size={18} /></a></li>
	</ul>
	<ul class="refs">
		<li><a href="/settings/archive">Архив<span class="meta">{archivedCount}</span><ChevronRight size={18} /></a></li>
	</ul>
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px calc(env(safe-area-inset-bottom) + 32px);
	}
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
	.goals {
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
	}
	.goals > li + li {
		border-top: 1px solid var(--line);
	}
	.goal-row {
		display: flex;
		align-items: center;
		min-height: 48px;
		padding-left: 4px;
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
	.goal-link {
		flex: 1;
		min-width: 0;
		padding: 12px 0;
		color: var(--text);
		text-decoration: none;
		font-weight: 600;
	}
	.count {
		color: var(--muted);
		font-size: 13px;
		margin-right: 4px;
	}
	.practices {
		padding-left: 36px;
	}
	.practice {
		display: flex;
		align-items: center;
		border-top: 1px solid var(--line);
	}
	.practice a {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		padding: 10px 0;
		color: var(--text);
		text-decoration: none;
	}
	.ptitle {
		font-size: 16px;
	}
	.meta {
		color: var(--muted);
		font-size: 13px;
	}
	.handle {
		flex: none;
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
	.add button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 14px;
		border: none;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 15px;
		cursor: pointer;
	}
	.practices .add {
		border-top: 1px solid var(--line);
	}
	.practices .add button {
		padding-left: 0;
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
	.refs-title {
		margin-top: 30px;
	}
	.refs {
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
		margin-bottom: 12px;
	}
	.refs li + li {
		border-top: 1px solid var(--line);
	}
	.refs a {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 0 10px 0 14px;
		color: var(--text);
		text-decoration: none;
	}
	.refs a .meta {
		margin-left: auto;
	}
	.error {
		background: color-mix(in oklab, #c98a06 18%, var(--surface));
		padding: 10px 14px;
		border-radius: 10px;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 6;
	}
	.addmenu {
		position: fixed;
		right: 12px;
		top: calc(env(safe-area-inset-top) + 50px);
		z-index: 7;
		min-width: 200px;
		padding: 6px;
		background: var(--surface);
		border-radius: 14px;
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.22);
	}
	.addmenu button,
	.addmenu a {
		display: flex;
		width: 100%;
		min-height: 44px;
		align-items: center;
		padding: 0 12px;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		text-decoration: none;
		text-align: left;
		cursor: pointer;
	}
</style>
