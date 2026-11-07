<script lang="ts">
	import { enhance } from '$app/forms';
	import { colorOf, palette, paletteKeys } from '#lib/palette.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const active = <T extends { archivedAt: string | null }>(xs: T[]) => xs.filter((x) => !x.archivedAt);
	const archived = $derived([
		...data.categories.filter((c) => c.archivedAt).map((c) => ({ kind: 'category', id: c.id, title: c.name, what: 'категория' })),
		...data.goals.filter((g) => g.archivedAt).map((g) => ({ kind: 'goal', id: g.id, title: g.title, what: 'цель' })),
		...data.practices.filter((p) => p.archivedAt).map((p) => ({ kind: 'practice', id: p.id, title: p.title, what: 'практика' }))
	]);
	const catName = (id: number) => data.categories.find((c) => c.id === id)?.name ?? '—';
	const goalTitle = (id: number) => data.goals.find((g) => g.id === id)?.title ?? '—';
	const catOfGoal = (id: number) => data.categories.find((c) => c.id === data.goals.find((g) => g.id === id)?.categoryId);

	// Close the open <details> after a successful save.
	const save = () => {
		return async ({ result, update, formElement }: any) => {
			await update({ reset: false });
			if (result.type === 'success') formElement.closest('details')?.removeAttribute('open');
		};
	};
</script>

<svelte:head><title>Настройки · 1%</title></svelte:head>

<main>
	<header>
		<a href="/" class="back">‹ Неделя</a>
		<h1>Настройки</h1>
	</header>

	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	<section>
		<h2>Практики</h2>
		<ul>
			{#each active(data.practices) as p, i (p.id)}
				{@const c = catOfGoal(p.goalId)}
				<li>
					<details>
						<summary>
							<span class="dot" style="--c:{colorOf(c?.color ?? 'slate').light}"></span>
							<span class="title">{p.title}</span>
							<span class="meta">{p.minDose} / {p.normDose} {p.unit}</span>
						</summary>
						<form method="POST" action="?/practice" use:enhance={save}>
							<input type="hidden" name="id" value={p.id} />
							{@render practiceFields(p)}
							<button>Сохранить</button>
						</form>
						<div class="row">
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="id" value={p.id} /><input type="hidden" name="dir" value="-1" />
								<button disabled={i === 0} aria-label="Выше">↑</button>
							</form>
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="id" value={p.id} /><input type="hidden" name="dir" value="1" />
								<button disabled={i === active(data.practices).length - 1} aria-label="Ниже">↓</button>
							</form>
							{@render archiveBtn('practice', p.id)}
						</div>
					</details>
				</li>
			{/each}
			<li>
				<details>
					<summary class="add">+ Практика</summary>
					<form method="POST" action="?/practice" use:enhance={save}>
						{@render practiceFields()}
						<button>Добавить</button>
					</form>
				</details>
			</li>
		</ul>
	</section>

	<section>
		<h2>Цели</h2>
		<ul>
			{#each active(data.goals) as g (g.id)}
				<li>
					<details>
						<summary>
							<span class="title">{g.title}</span>
							<span class="meta">{catName(g.categoryId)}</span>
						</summary>
						<form method="POST" action="?/goal" use:enhance={save}>
							<input type="hidden" name="id" value={g.id} />
							{@render goalFields(g)}
							<button>Сохранить</button>
						</form>
						<div class="row">{@render archiveBtn('goal', g.id)}</div>
					</details>
				</li>
			{/each}
			<li>
				<details>
					<summary class="add">+ Цель</summary>
					<form method="POST" action="?/goal" use:enhance={save}>
						{@render goalFields()}
						<button>Добавить</button>
					</form>
				</details>
			</li>
		</ul>
	</section>

	<section>
		<h2>Категории</h2>
		<ul>
			{#each active(data.categories) as c (c.id)}
				<li>
					<details>
						<summary>
							<span class="dot" style="--c:{colorOf(c.color).light}"></span>
							<span class="title">{c.name}</span>
						</summary>
						<form method="POST" action="?/category" use:enhance={save}>
							<input type="hidden" name="id" value={c.id} />
							{@render categoryFields(c)}
							<button>Сохранить</button>
						</form>
						<div class="row">{@render archiveBtn('category', c.id)}</div>
					</details>
				</li>
			{/each}
			<li>
				<details>
					<summary class="add">+ Категория</summary>
					<form method="POST" action="?/category" use:enhance={save}>
						{@render categoryFields()}
						<button>Добавить</button>
					</form>
				</details>
			</li>
		</ul>
	</section>

	{#if archived.length}
		<section>
			<details>
				<summary class="h2">Архив · {archived.length}</summary>
				<ul>
					{#each archived as a (a.kind + a.id)}
						<li class="archived">
							<span class="title">{a.title}</span>
							<span class="meta">{a.what}</span>
							<form method="POST" action="?/restore" use:enhance>
								<input type="hidden" name="kind" value={a.kind} /><input type="hidden" name="id" value={a.id} />
								<button>Вернуть</button>
							</form>
						</li>
					{/each}
				</ul>
			</details>
		</section>
	{/if}
</main>

{#snippet archiveBtn(kind: string, id: number)}
	<form method="POST" action="?/archive" use:enhance class="push">
		<input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
		<button class="quiet">В архив</button>
	</form>
{/snippet}

{#snippet practiceFields(p?: (typeof data.practices)[number])}
	<label>Название <input name="title" value={p?.title ?? ''} required /></label>
	<label
		>Цель
		<select name="goalId" required>
			{#if !p}<option value="" disabled selected>Выберите цель</option>{/if}
			{#each data.goals.filter((g) => !g.archivedAt || g.id === p?.goalId) as g (g.id)}
				<option value={g.id} selected={g.id === p?.goalId}>{g.title}</option>
			{/each}
		</select>
	</label>
	<div class="three">
		<label>Единица <input name="unit" value={p?.unit ?? ''} placeholder="мин" required /></label>
		<label>Минимум <input name="minDose" inputmode="decimal" value={p?.minDose ?? ''} required /></label>
		<label>Норма <input name="normDose" inputmode="decimal" value={p?.normDose ?? ''} required /></label>
	</div>
{/snippet}

{#snippet goalFields(g?: (typeof data.goals)[number])}
	<label>Название <input name="title" value={g?.title ?? ''} required /></label>
	<label
		>Категория
		<select name="categoryId" required>
			{#if !g}<option value="" disabled selected>Выберите категорию</option>{/if}
			{#each data.categories.filter((c) => !c.archivedAt || c.id === g?.categoryId) as c (c.id)}
				<option value={c.id} selected={c.id === g?.categoryId}>{c.name}</option>
			{/each}
		</select>
	</label>
	<label>Направление — зачем <input name="direction" value={g?.direction ?? ''} /></label>
	<label>Текущий майлстон <input name="milestoneText" value={g?.milestoneText ?? ''} /></label>
{/snippet}

{#snippet categoryFields(c?: (typeof data.categories)[number])}
	<label>Название <input name="name" value={c?.name ?? ''} required /></label>
	<fieldset>
		<legend>Цвет</legend>
		<div class="swatches">
			{#each paletteKeys as k, i (k)}
				<label class="swatch" title={palette[k].name}>
					<input type="radio" name="color" value={k} checked={c ? c.color === k : i === 0} />
					<span style="--c:{palette[k].light};--cd:{palette[k].dark}"></span>
				</label>
			{/each}
		</div>
	</fieldset>
{/snippet}

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 32px);
	}
	header {
		display: flex;
		align-items: baseline;
		gap: 16px;
	}
	h1 {
		font-size: 22px;
		margin: 8px 0 16px;
	}
	.back {
		color: var(--muted);
		text-decoration: none;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	h2,
	.h2 {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 24px 0 8px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
	}
	li + li {
		border-top: 1px solid var(--line);
	}
	summary {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		padding: 0 14px;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.add {
		color: var(--muted);
	}
	.title {
		flex: 1;
	}
	.meta {
		color: var(--muted);
		font-size: 14px;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 4px;
		background: var(--c);
		flex: none;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 4px 14px 12px;
	}
	.row {
		display: flex;
		gap: 8px;
		padding: 0 14px 14px;
	}
	.row form {
		padding: 0;
	}
	.push {
		margin-left: auto;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
		color: var(--muted);
	}
	input:not([type='radio']),
	select {
		font-size: 17px;
		min-height: 44px;
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		width: 100%;
		box-sizing: border-box;
	}
	.three {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 8px;
	}
	button {
		min-height: 44px;
		padding: 0 16px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.35;
	}
	button.quiet {
		background: none;
		color: var(--muted);
	}
	fieldset {
		border: none;
		padding: 0;
		margin: 0;
	}
	legend {
		font-size: 13px;
		color: var(--muted);
		margin-bottom: 6px;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.swatch input {
		position: absolute;
		opacity: 0;
	}
	.swatch span {
		display: block;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: var(--c);
		border: 3px solid transparent;
	}
	@media (prefers-color-scheme: dark) {
		.swatch span {
			background: var(--cd);
		}
	}
	.swatch input:checked + span {
		border-color: var(--text);
	}
	.swatch input:focus-visible + span {
		outline: 2px solid var(--text);
		outline-offset: 2px;
	}
	.archived {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 6px 6px 14px;
	}
	.archived form {
		padding: 0;
	}
	.error {
		background: color-mix(in oklab, #c98a06 18%, var(--surface));
		padding: 10px 14px;
		border-radius: 10px;
	}
</style>
