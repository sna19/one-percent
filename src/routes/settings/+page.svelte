<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import TopBar from '#lib/TopBar.svelte';
	import { backFrom } from '#lib/back.js';
	import { colorOf, palette, paletteKeys } from '#lib/palette.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const active = <T extends { archivedAt: string | null }>(xs: T[]) => xs.filter((x) => !x.archivedAt);
	const archived = $derived([
		...data.categories.filter((c) => c.archivedAt).map((c) => ({ kind: 'category', id: c.id, title: c.name, what: 'категория' })),
		...data.goals.filter((g) => g.archivedAt).map((g) => ({ kind: 'goal', id: g.id, title: g.title, what: 'цель' })),
		...data.practices.filter((p) => p.archivedAt).map((p) => ({ kind: 'practice', id: p.id, title: p.title, what: 'практика' })),
		...data.formats.filter((f) => f.archivedAt).map((f) => ({ kind: 'format', id: f.id, title: f.name, what: 'формат' })),
		...data.templates.filter((t) => t.archivedAt).map((t) => ({ kind: 'template', id: t.id, title: t.name, what: 'шаблон плана' }))
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
	<TopBar title="Настройки" back={backFrom(page.url.searchParams)} />

	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}

	<section>
		<h2>Практики</h2>
		<ul>
			{#each active(data.practices) as p, i (p.id)}
				{@const c = catOfGoal(p.goalId)}
				<li class="practice">
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
						<div class="row">{@render archiveBtn('practice', p.id)}</div>
					</details>
					<!-- Order is the main-screen row order: always visible, one tap per step. -->
					<div class="order">
						<form method="POST" action="?/move" use:enhance>
							<input type="hidden" name="kind" value="practice" /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="dir" value="-1" />
							<button disabled={i === 0} aria-label="{p.title}: выше">↑</button>
						</form>
						<form method="POST" action="?/move" use:enhance>
							<input type="hidden" name="kind" value="practice" /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="dir" value="1" />
							<button disabled={i === active(data.practices).length - 1} aria-label="{p.title}: ниже">↓</button>
						</form>
					</div>
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
		<h2>План</h2>
		<ul>
			<li>
				<form method="POST" action="?/limit" use:enhance class="limit">
					<label
						>Мягкий лимит практик в плане
						<input name="limit" inputmode="numeric" value={data.planLimit ?? ''} placeholder="без лимита" />
					</label>
					<button>Сохранить</button>
				</form>
			</li>
			{#each data.templates.filter((t) => !t.archivedAt) as t (t.id)}
				<li>
					<details>
						<summary><span class="title">{t.name}</span><span class="meta">шаблон</span></summary>
						<form method="POST" action="?/template" use:enhance={save}>
							<input type="hidden" name="id" value={t.id} />
							<label>Название <input name="name" value={t.name} required /></label>
							<button>Сохранить</button>
						</form>
						<div class="row">{@render archiveBtn('template', t.id)}</div>
					</details>
				</li>
			{/each}
		</ul>
		<p class="hint">Шаблоны создаются на экране плана: «Утвердить» → «Сохранить как шаблон».</p>
	</section>

	<section>
		<h2>Форматы</h2>
		<ul>
			{#each active(data.formats) as f, i (f.id)}
				<li class="practice">
					<details>
						<summary>
							<span class="title">{f.name}</span>
							<span class="meta">{data.practices.filter((p) => !p.archivedAt && p.formatId === f.id).length}</span>
						</summary>
						<form method="POST" action="?/format" use:enhance={save}>
							<input type="hidden" name="id" value={f.id} />
							<label>Название <input name="name" value={f.name} required /></label>
							<button>Сохранить</button>
						</form>
						<div class="row">{@render archiveBtn('format', f.id)}</div>
					</details>
					<div class="order">
						<form method="POST" action="?/move" use:enhance>
							<input type="hidden" name="kind" value="format" /><input type="hidden" name="id" value={f.id} /><input type="hidden" name="dir" value="-1" />
							<button disabled={i === 0} aria-label="{f.name}: выше">↑</button>
						</form>
						<form method="POST" action="?/move" use:enhance>
							<input type="hidden" name="kind" value="format" /><input type="hidden" name="id" value={f.id} /><input type="hidden" name="dir" value="1" />
							<button disabled={i === active(data.formats).length - 1} aria-label="{f.name}: ниже">↓</button>
						</form>
					</div>
				</li>
			{/each}
			<li>
				<details>
					<summary class="add">+ Формат</summary>
					<form method="POST" action="?/format" use:enhance={save}>
						<label>Название <input name="name" required /></label>
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
	<label
		>Формат
		<select name="formatId">
			<option value="" selected={!p?.formatId}>Без формата</option>
			{#each data.formats.filter((f) => !f.archivedAt || f.id === p?.formatId) as f (f.id)}
				<option value={f.id} selected={f.id === p?.formatId}>{f.name}</option>
			{/each}
		</select>
	</label>
	<fieldset>
		<legend>Обычные дни — для планирования</legend>
		<div class="weekdays">
			{#each [1, 2, 3, 4, 5, 6, 0] as wd (wd)}
				<label class="wd">
					<input type="checkbox" name="defaultDays" value={wd} checked={(p?.defaultDays ?? '').split(',').includes(String(wd))} />
					<span>{['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][wd]}</span>
				</label>
			{/each}
		</div>
	</fieldset>
	<fieldset>
		<legend>План дня</legend>
		<label class="toggle"
			><input type="checkbox" name="showNoteFull" checked={p?.showNoteFull ?? false} /> Показывать заметку дня целиком</label
		>
		<label class="toggle"
			><input type="checkbox" name="checklistMarks" checked={p?.checklistMarks ?? false} /> Отметка по чеклисту заметки дня</label
		>
	</fieldset>
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
		padding: 0 16px calc(env(safe-area-inset-bottom) + 32px);
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
	.practice {
		position: relative;
	}
	.practice summary {
		padding-right: 104px;
	}
	.order {
		position: absolute;
		top: 2px;
		right: 8px;
		display: flex;
		gap: 4px;
	}
	.order form {
		padding: 0;
	}
	.order button {
		min-height: 44px;
		width: 44px;
		padding: 0;
		border: none;
		background: none;
		font-size: 18px;
		color: var(--muted);
	}
	.order button:disabled {
		opacity: 0.25;
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
	.weekdays {
		display: flex;
		gap: 6px;
	}
	.wd {
		flex: 1;
	}
	.wd input {
		position: absolute;
		opacity: 0;
	}
	.wd span {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		border-radius: 8px;
		border: 1px solid var(--line);
		color: var(--text);
		font-size: 14px;
	}
	.wd input:checked + span {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
	}
	.wd input:focus-visible + span {
		outline: 2px solid var(--text);
		outline-offset: 2px;
	}
	.toggle {
		flex-direction: row;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		font-size: 15px;
		color: var(--text);
	}
	.toggle input {
		width: 20px;
		height: 20px;
		flex: none;
	}
	.limit {
		flex-direction: row;
		align-items: flex-end;
		padding: 12px 14px;
	}
	.limit label {
		flex: 1;
	}
	.hint {
		font-size: 13px;
		color: var(--muted);
		margin: 8px 4px 0;
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
