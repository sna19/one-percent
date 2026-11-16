<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { crossfade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import Flag from '@lucide/svelte/icons/flag';
	import Star from '@lucide/svelte/icons/star';
	import CirclePlus from '@lucide/svelte/icons/circle-plus';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TopBar from '#lib/TopBar.svelte';
	import GoalImage from '#lib/GoalImage.svelte';
	import QuickCapture from '#lib/inbox/QuickCapture.svelte';
	import { todayStr, weekDays, weekStart } from '#lib/dates.js';
	import { amountLabel, budgetLabel, pace, remaining } from '#lib/milestones.js';
	import { colorOf } from '#lib/palette.js';
	import { keyOf, nav } from '#lib/nav.svelte.js';
	import type { Gallery, GalleryGoal } from '#lib/server/goals.js';

	/**
	 * #26 (replaces the ribbons of Spec 013) — «Цели» without heaps: three tiers, all vertical.
	 * ★ В фокусе — up to three compact cards (the week's focus of Spec 010; ☆ / ★ toggles it, the goal moves);
	 * Эта неделя — rows of goals with practices in this week's plan; Остальные — folded categories, then
	 * «На паузе» (out of the plan by rotation) and «Пройденный путь». What is missing is simply not drawn.
	 */
	const today = todayStr();
	const days = weekDays(weekStart(today));
	let g = $state<Gallery | null>(null);
	let error = $state<string | null>(null);
	let capture: QuickCapture;
	let replacing = $state<GalleryGoal | null>(null);
	const [send, receive] = crossfade({ duration: 260 });

	// what is unfolded is remembered on this device
	let unfolded = $state<string[]>([]);
	onMount(async () => {
		try {
			unfolded = JSON.parse(localStorage.getItem('goals-unfolded') ?? '[]');
		} catch {
			/* private mode */
		}
		await load();
		nav.restore(keyOf(page.url));
	});
	function fold(k: string) {
		unfolded = unfolded.includes(k) ? unfolded.filter((x) => x !== k) : [...unfolded, k];
		try {
			localStorage.setItem('goals-unfolded', JSON.stringify(unfolded));
		} catch {
			/* not critical */
		}
	}

	async function load() {
		const r = await fetch(`/api/goals?today=${today}`).catch(() => undefined);
		if (!r?.ok) {
			error = 'Цели не загрузились: нет связи с сервером';
			return;
		}
		g = await r.json();
		error = null;
	}

	const all = $derived(g ? g.categories.flatMap((c) => c.goals) : []);
	const focus = $derived(g ? g.focus.map((id) => all.find((x) => x.id === id)).filter((x): x is GalleryGoal => !!x) : []);
	const week = $derived(all.filter((x) => x.inWeek && !x.focus));
	const paused = $derived(all.filter((x) => x.rotation && !x.focus));
	const rest = $derived(
		(g?.categories ?? [])
			.map((c) => ({ ...c, goals: c.goals.filter((x) => !x.focus && !x.inWeek && !x.rotation) }))
			.filter((c) => c.goals.length)
	);

	/** ☆ → into focus; ★ → back to its place. A fourth asks which one to take out. */
	async function star(x: GalleryGoal, out?: GalleryGoal) {
		if (!g) return;
		let ids = [...g.focus];
		if (x.focus) ids = ids.filter((id) => id !== x.id);
		else if (out) ids = [...ids.filter((id) => id !== out.id), x.id];
		else if (ids.length >= 3) {
			replacing = x;
			return;
		} else ids = [...ids, x.id];
		replacing = null;
		const before = $state.snapshot(g);
		g.focus = ids;
		for (const c of g.categories) for (const y of c.goals) y.focus = ids.includes(y.id);
		const r = await fetch('/api/review', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'focus', start: weekStart(today), today, goalIds: ids })
		}).catch(() => undefined);
		if (!r?.ok) {
			g = before;
			error = (await r?.json().catch(() => null))?.message ?? 'Нет связи с сервером';
		}
	}

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

	function paceWords(x: GalleryGoal): string {
		const m = x.milestone;
		if (!m || m.budgetKind === 'none' || !m.budgetTarget) return '';
		const head = budgetLabel(m, m.progress);
		if (!m.dueDate || !m.startDate) return head;
		const p = pace({ ...m, startDate: m.startDate }, m.progress, today);
		if (!p) return head;
		const lag = -p.delta;
		if (lag <= 0) return `${head} · в темпе`;
		if (lag < m.budgetTarget * 0.1) return `${head} · чуть отстаёшь`;
		return `${head} · отстаёшь на ${m.budgetKind === 'sessions' ? `${Math.round(lag)} зан.` : amountLabel(lag, m.budgetUnit)}`;
	}
	const share = (x: GalleryGoal) => (x.milestone?.budgetTarget ? Math.min(100, (x.milestone.progress / x.milestone.budgetTarget) * 100) : 0);
	const goalsWord = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'цель' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'цели' : 'целей'}`;
</script>

<svelte:head><title>Цели</title></svelte:head>

{#snippet starBtn(x: GalleryGoal)}
	<button class="star" class:on={x.focus} aria-pressed={x.focus} aria-label="{x.title}: {x.focus ? 'убрать из фокуса' : 'в фокус'}" onclick={() => star(x)}
		><Star size={20} fill={x.focus ? 'currentColor' : 'none'} /></button
	>
{/snippet}

{#snippet dots(x: GalleryGoal)}
	<span class="dots" aria-label="эта неделя">
		{#each x.week as on, i (i)}{#if days[i] <= today}<span class="dot" class:on></span>{/if}{/each}
	</span>
{/snippet}

{#snippet row(x: GalleryGoal, pale = false)}
	<li class="row" class:pale in:receive={{ key: x.id }} out:send={{ key: x.id }} style="--c-light:{colorOf(x.color).light};--c-dark:{colorOf(x.color).dark}">
		<a class="obj rlink" href="/settings/goal/{x.id}?from=goals">
			<GoalImage kind={x.imageKind} value={x.imageValue} color={x.color} title={x.title} size={26} soft />
			<span class="rt">{x.title}</span>
			{#if x.volume}<span class="vol">{x.volume}</span>{:else}{@render dots(x)}{/if}
		</a>
		{@render starBtn(x)}
	</li>
{/snippet}

<main>
	<TopBar help="goals" title="Цели" onAdd={() => capture.show()}>
		{#snippet actions()}
			<button class="icon" aria-label="Новая цель" title="Новая цель" onclick={newGoal}><CirclePlus size={22} /></button>
		{/snippet}
	</TopBar>

	{#if error}<p class="note" role="alert">{error}</p>{/if}

	{#if g}
		{#if !all.length}
			<div class="empty-state">
				<p>Создай первую цель.</p>
				<button class="primary" onclick={newGoal}>Новая цель</button>
			</div>
		{:else}
			<section>
				<h2><Star size={13} fill="currentColor" />В фокусе</h2>
				{#if focus.length}
					<ul class="cards">
						{#each focus as x (x.id)}
							<li
								class="card"
								animate:flip={{ duration: 220 }}
								in:receive={{ key: x.id }}
								out:send={{ key: x.id }}
								style="--c-light:{colorOf(x.color).light};--c-dark:{colorOf(x.color).dark}"
							>
								<a class="obj clink" href="/settings/goal/{x.id}?from=goals">
									<span class="chead">
										<GoalImage kind={x.imageKind} value={x.imageValue} color={x.color} title={x.title} size={30} soft />
										<span class="ct">{x.title}</span>
									</span>
									{#if x.milestone}
										<span class="ms"><Flag size={13} /><span class="mt">{x.milestone.title}</span>{#if x.milestone.dueDate}<span class="due">· {remaining(x.milestone.dueDate, today)}</span>{/if}</span>
										{#if x.milestone.budgetKind !== 'none' && x.milestone.budgetTarget}
											<span class="bar"><span style="width:{share(x)}%"></span></span>
										{/if}
									{/if}
									<span class="foot"><span>{paceWords(x) || x.volume || ''}</span>{@render dots(x)}</span>
								</a>
								{@render starBtn(x)}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="hint">Отметь ☆ у одной–трёх целей — они встанут сюда, ради них и планируется неделя.</p>
				{/if}
			</section>

			{#if week.length}
				<section>
					<h2>Эта неделя{g.template ? ` · ${g.template}` : ''}</h2>
					<ul class="rows">{#each week as x (x.id)}{@render row(x)}{/each}</ul>
				</section>
			{/if}

			{#if rest.length || paused.length || g.path.length}
				<section>
					<h2>Остальные</h2>
					<ul class="rows folds">
						{#each rest as c (c.id)}
							{@const open = unfolded.includes(`c${c.id}`)}
							<li class="fold">
								<button class="fbtn" aria-expanded={open} onclick={() => fold(`c${c.id}`)}>
									<span class="chev" class:open><ChevronRight size={16} /></span><span class="cdot" style="--c:{colorOf(c.color).light}"></span>{c.name}<span class="n">{c.goals.length}</span>
								</button>
								{#if open}<ul class="rows inner">{#each c.goals as x (x.id)}{@render row(x)}{/each}</ul>{/if}
							</li>
						{/each}
						{#if paused.length}
							{@const open = unfolded.includes('paused')}
							<li class="fold">
								<button class="fbtn pale" aria-expanded={open} onclick={() => fold('paused')}>
									<span class="chev" class:open><ChevronRight size={16} /></span>На паузе<span class="n">{goalsWord(paused.length)}</span>
								</button>
								{#if open}<ul class="rows inner">{#each paused as x (x.id)}{@render row(x, true)}{/each}</ul>{/if}
							</li>
						{/if}
						{#if g.path.length}
							{@const open = unfolded.includes('path')}
							<li class="fold">
								<button class="fbtn pale" aria-expanded={open} onclick={() => fold('path')}>
									<span class="chev" class:open><ChevronRight size={16} /></span>Пройденный путь<span class="n">{g.path.length}</span>
								</button>
								{#if open}
									<ul class="rows inner">
										{#each g.path as x (x.id)}
											<li class="row pale">
												<a class="obj rlink" href="/settings/goal/{x.id}?from=goals">
													<GoalImage kind={x.imageKind} value={x.imageValue} color={x.color} title={x.title} size={26} soft />
													<span class="rt">{x.title}</span>
													<span class="vol">{x.archivedAt ? new Date(x.archivedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/if}
					</ul>
				</section>
			{/if}
		{/if}
	{:else if !error}
		<p class="note">Загрузка…</p>
	{/if}
</main>

{#if replacing}
	{@const x = replacing}
	<div class="backdrop" role="presentation" onclick={() => (replacing = null)}></div>
	<div class="sheet" role="dialog" aria-label="Какую цель снять с фокуса">
		<p class="q">В фокусе уже 3 цели — какую снять, чтобы поставить «{x.title}»?</p>
		<ul class="rows">
			{#each focus as f (f.id)}
				<li class="row">
					<button class="rlink pickout" onclick={() => star(x, f)}>
						<GoalImage kind={f.imageKind} value={f.imageValue} color={f.color} title={f.title} size={26} soft />
						<span class="rt">{f.title}</span>
					</button>
				</li>
			{/each}
		</ul>
		<button class="cancel" onclick={() => (replacing = null)}>Отмена</button>
	</div>
{/if}

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
		gap: 6px;
		margin: 0 0 8px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.card {
		--c: var(--c-light);
		position: relative;
		border-radius: 14px;
		background: var(--surface);
		border-left: 4px solid var(--c);
	}
	@media (prefers-color-scheme: dark) {
		.card,
		.row {
			--c: var(--c-dark);
		}
	}
	.clink {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px 52px 10px 12px;
	}
	.chead {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.ct {
		font-size: 17px;
		font-weight: 700;
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
		display: block;
		height: 4px;
		border-radius: 2px;
		background: var(--bg);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--c);
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--muted);
	}
	.rows {
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
	}
	.rows.inner {
		background: none;
		border-radius: 0;
	}
	.row {
		--c: var(--c-light);
		position: relative;
		display: flex;
		align-items: center;
	}
	.row + .row,
	.fold + .fold {
		border-top: 1px solid var(--line);
	}
	.row.pale {
		opacity: 0.6;
	}
	.rlink {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 46px;
		padding: 0 4px 0 12px;
	}
	.rt {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 16px;
	}
	.vol {
		flex: none;
		font-size: 13px;
		color: var(--muted);
	}
	.dots {
		flex: none;
		display: inline-flex;
		gap: 4px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1.5px solid var(--c);
		box-sizing: border-box;
	}
	.dot.on {
		background: var(--c);
	}
	.star {
		flex: none;
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.star.on {
		color: var(--text);
	}
	.card .star {
		position: absolute;
		top: 4px;
		right: 4px;
	}
	.fbtn {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 46px;
		padding: 0 12px;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		text-align: left;
		cursor: pointer;
	}
	.fbtn.pale {
		color: var(--muted);
	}
	.chev {
		display: inline-flex;
		color: var(--muted);
		transition: transform 0.15s;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.cdot {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: var(--c);
	}
	.n {
		margin-left: auto;
		font-size: 13px;
		color: var(--muted);
	}
	.hint,
	.note {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}
	.empty-state {
		margin: 40px 0;
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
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px calc(env(safe-area-inset-bottom) + 12px);
		background: var(--bg);
		border-radius: 16px 16px 0 0;
	}
	.q {
		margin: 0;
		font-weight: 600;
	}
	.pickout {
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.cancel {
		min-height: 44px;
		border: none;
		background: none;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
</style>
