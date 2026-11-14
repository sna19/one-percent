<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { addDays, isDateStr, todayStr, weekDays, weekStart } from '#lib/dates.js';
	import { colorOf } from '#lib/palette.js';
	import { groupPractices } from '#lib/groups.js';
	import type { PlanView, PracticeView, WeekSummary } from '#lib/types.js';
	import NoteSheet from '#lib/NoteSheet.svelte';
	import TopBar from '#lib/TopBar.svelte';
	import { backFrom } from '#lib/back.js';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Layers from '@lucide/svelte/icons/layers';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { inPreview, saveOrder, sortable } from '#lib/sortable.js';
	import { settingsApi } from '#lib/settingsApi.js';
	import { isEmptyNote, type NoteDoc } from '#lib/note.js';
	import { enqueueDayNote, flush } from '#lib/store.js';

	/** Spec 003 — plan a week in about a minute: pick a source, adjust, confirm. */
	interface PlannerData {
		start: string;
		practices: PracticeView[];
		plan: PlanView | null;
		templates: { id: number; name: string }[];
		pastWeeks: ({ weekStart: string } & WeekSummary)[];
		limit: number | null;
	}

	const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
	const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
	const label = (s: string) => {
		const [, m, d] = s.split('-').map(Number);
		return `${d} ${MONTHS[m - 1]}`;
	};

	const today = todayStr();
	const q = page.url.searchParams.get('start');
	const start = isDateStr(q) ? weekStart(q) : weekStart(today);
	const days = weekDays(start);

	let data = $state<PlannerData | undefined>();
	let error = $state<string | undefined>();
	let busy = $state(false);
	let picker = $state<'template' | 'week' | undefined>();
	let saveTemplate = $state(false);
	let templateName = $state('');
	/** Spec 007 D: save as a new week template, or replace one */
	let saveMode = $state<'new' | number>('new');
	let manage = $state(false);
	let tplPreview = $state<number[] | null>(null);
	let limitInput = $state('');
	let renameTimers: Record<number, ReturnType<typeof setTimeout>> = {};
	function renameTemplate(id: number, name: string) {
		clearTimeout(renameTimers[id]);
		renameTimers[id] = setTimeout(async () => {
			try {
				await settingsApi('template', { id, name });
				await call(null);
			} catch (e) {
				error = (e as Error).message;
			}
		}, 600);
	}
	async function deleteTemplate(id: number, name: string) {
		if (!window.confirm(`Удалить шаблон недели «${name}»? Его можно будет вернуть из архива в настройках.`)) return;
		await settingsApi('archive', { kind: 'template', id });
		await call(null);
	}
	let limitTimer: ReturnType<typeof setTimeout> | undefined;
	function saveLimit() {
		clearTimeout(limitTimer);
		limitTimer = setTimeout(async () => {
			try {
				await settingsApi('limit', { limit: limitInput.trim() });
				await call(null);
			} catch (e) {
				error = (e as Error).message;
			}
		}, 600);
	}
	$effect(() => {
		if (manage) limitInput = data?.limit ? String(data.limit) : '';
	});
	let done = $state(false);

	const planned = $derived(new Set(Object.entries(data?.plan?.items ?? {}).flatMap(([p, ds]) => ds.map((d) => `${p}|${d}`))));
	const isPlanned = (pid: number, d: string) => planned.has(`${pid}|${d}`);
	const groups = $derived(groupPractices(data?.practices ?? [], 'goal'));
	const practiceCount = $derived(Object.values(data?.plan?.items ?? {}).filter((ds) => ds.length).length);
	const sessionCount = $derived(planned.size);
	const tooMany = $derived(data?.limit != null && practiceCount > data.limit);

	async function call(body: Record<string, unknown> | null) {
		busy = true;
		error = undefined;
		try {
			const r = body
				? await fetch('/api/plan', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ start, today, ...body })
					})
				: await fetch(`/api/plan?start=${start}&today=${today}`);
			const j = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(j.message ?? `Ошибка ${r.status}`);
			data = j;
			return true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Нет связи с сервером';
			return false;
		} finally {
			busy = false;
		}
	}

	const source = (src: string) => {
		picker = undefined;
		call({ action: 'source', source: src });
	};
	// Taps show at once and go to the server one by one. Taps not yet confirmed by the server
	// are re-applied on top of each answer, so a quick series of taps never flickers back.
	const unconfirmed = new Map<string, boolean>();
	let chain: Promise<unknown> = Promise.resolve();

	function show(pid: number, d: string, on: boolean) {
		if (!data) return;
		data.plan ??= { weekStart: start, status: 'draft', source: 'empty', items: {}, notes: {} };
		const ds = data.plan.items[pid] ?? [];
		const next = on ? (ds.includes(d) ? ds : [...ds, d]) : ds.filter((x) => x !== d);
		data.plan.items = { ...data.plan.items, [pid]: next };
	}

	function reapplyUnconfirmed() {
		for (const [key, on] of unconfirmed) {
			const [pid, d] = key.split('|');
			show(Number(pid), d, on);
		}
	}

	// Spec 006: a planned day has a menu — its day note, or taking it out of the plan.
	let menu = $state<{ p: PracticeView; d: string } | undefined>();
	let noteFor = $state<{ p: PracticeView; d: string } | undefined>();
	const noteOf = (pid: number, d: string): NoteDoc | null => data?.plan?.notes?.[`${pid}|${d}`]?.note ?? null;
	const hasNote = (pid: number, d: string) => {
		const n = noteOf(pid, d);
		return !!n && (!isEmptyNote(n) || JSON.stringify(n).includes('"taskItem"'));
	};

	function cellTap(p: PracticeView, d: string) {
		if (isPlanned(p.id, d)) menu = { p, d };
		else if (d >= today) toggle(p, d);
	}

	function unplan(p: PracticeView, d: string) {
		menu = undefined;
		if (hasNote(p.id, d) && !window.confirm(`Убрать ${label(d)} из плана? Заметка этого дня удалится.`)) return;
		toggle(p, d);
	}

	async function saveDayNote(p: PracticeView, d: string, doc: NoteDoc | null) {
		const updatedAt = new Date().toISOString();
		if (data?.plan) {
			const k = `${p.id}|${d}`;
			const notes = { ...(data.plan.notes ?? {}) };
			if (doc) notes[k] = { note: doc, updatedAt };
			else delete notes[k];
			data.plan.notes = notes;
		}
		await enqueueDayNote({ practiceId: p.id, date: d, note: doc, updatedAt });
		await flush();
	}

	/** Copies this day's note to the practice's other planned days of the week, today and later. */
	async function copyToWeek(p: PracticeView, d: string) {
		await flush(); // the note just typed must reach the server first
		const targets = days.filter((x) => x !== d && x >= today && isPlanned(p.id, x));
		if (!targets.length) {
			error = 'Других запланированных дней на этой неделе нет';
			return;
		}
		const withNotes = targets.filter((x) => hasNote(p.id, x)).length;
		const ask = withNotes
			? `Скопировать заметку на ${targets.length} дн.? В ${withNotes} из них заметка заменится. Галочки будут сняты.`
			: `Скопировать заметку на ${targets.length} дн.? Галочки будут сняты.`;
		if (!window.confirm(ask)) return;
		noteFor = undefined;
		await call({ action: 'copyNote', practiceId: p.id, date: d });
	}

	const toggle = (p: PracticeView, d: string) => {
		if (d < today) return;
		const on = !isPlanned(p.id, d); // decide before changing anything on screen
		const key = `${p.id}|${d}`;
		unconfirmed.set(key, on);
		show(p.id, d, on);
		chain = chain.then(async () => {
			await call({ action: 'item', practiceId: p.id, date: d, planned: on });
			if (unconfirmed.get(key) === on) unconfirmed.delete(key);
			reapplyUnconfirmed();
		});
	};
	const row = (p: PracticeView, mode: 'daily' | 'default' | 'clear') => call({ action: 'row', practiceId: p.id, mode });

	async function confirm() {
		if (saveTemplate && saveMode !== 'new') {
			const t = data?.templates.find((x) => x.id === saveMode);
			if (!window.confirm(`Заменить шаблон недели «${t?.name}» этим планом? Прежнее содержимое шаблона пропадёт.`)) return;
		}
		const ok = await call({
			action: 'confirm',
			templateName: saveTemplate && saveMode === 'new' ? templateName : undefined,
			replaceTemplateId: saveTemplate && saveMode !== 'new' ? saveMode : undefined
		});
		if (ok) done = true;
	}

	/** «Новая неделя с нуля» from the menu: clears the plan from today on, after a question. */
	function fresh() {
		if (window.confirm('Очистить план этой недели с сегодняшнего дня? Прошедшие дни не изменятся.')) source('empty');
	}

	onMount(async () => {
		await call(null);
		const q = page.url.searchParams;
		if (q.get('templates')) manage = true;
		if (q.get('fresh')) fresh();
	});

	const style = (c: string) => `--c-light:${colorOf(c).light};--c-dark:${colorOf(c).dark}`;
</script>

<svelte:head><title>План · 1%</title></svelte:head>

<main>
	<TopBar
		title="План недели"
		subtitle="{label(days[0])} – {label(days[6])}"
		back={backFrom(page.url.searchParams, 'week')}
		menu={[
			{ label: 'Шаблоны недели', icon: Layers, onclick: () => (manage = true) },
			{ label: 'Новая неделя с нуля', icon: CalendarPlus, onclick: () => fresh() }
		]}
	/>

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if done}
		<div class="done">
			<p>
				План утверждён{saveTemplate && saveMode === 'new' && templateName
					? `, шаблон недели «${templateName}» сохранён`
					: saveTemplate && saveMode !== 'new'
						? `, шаблон недели «${data?.templates.find((x) => x.id === saveMode)?.name}» заменён`
						: ''}.
			</p>
			<a class="primary" href="/">К неделе</a>
		</div>
	{:else if !data}
		<p class="muted">Загрузка…</p>
	{:else}
		<section>
			<h2>1. Источник</h2>
			<div class="sources">
				<button disabled={busy} onclick={() => source('previous')}>Как прошлая неделя</button>
				<button disabled={busy} onclick={() => source('empty')}>С нуля</button>
				<button disabled={busy || !data.templates.length} onclick={() => (picker = picker === 'template' ? undefined : 'template')}
					>Шаблон недели{data.templates.length ? '' : ' (нет)'}</button
				>
				<button disabled={busy || !data.pastWeeks.length} onclick={() => (picker = picker === 'week' ? undefined : 'week')}
					>Другая неделя</button
				>
			</div>
			{#if picker === 'template'}
				<ul class="pick">
					{#each data.templates as t (t.id)}
						<li><button onclick={() => source(`template:${t.id}`)}>{t.name}</button></li>
					{/each}
				</ul>
			{:else if picker === 'week'}
				<ul class="pick">
					{#each data.pastWeeks as w (w.weekStart)}
						<li>
							<button onclick={() => source(`week:${w.weekStart}`)}
								>{label(w.weekStart)} – {label(addDays(w.weekStart, 6))}
								<span class="muted">по плану {w.done} из {w.planned}</span></button
							>
						</li>
					{/each}
				</ul>
			{/if}
			{#if start <= today && days.some((d) => d < today)}
				<p class="muted small">Прошедшие дни недели не меняются: источник заполняет план с сегодняшнего дня.</p>
			{/if}
		</section>

		<section>
			<h2>2. Редактор</h2>
			<p class="muted small">
				В плане {practiceCount} практик, {sessionCount} занятий. Тап по клетке включает и выключает день.
			</p>
			{#if tooMany}
				<p class="warn">В плане {practiceCount} практик. Это реалистично?</p>
			{/if}
			<div class="grid">
				<div></div>
				{#each days as d (d)}
					<div class="day" class:is-today={d === today}>
						<span>{DAY_NAMES[new Date(d + 'T12:00').getDay()]}</span><b>{Number(d.slice(8))}</b>
					</div>
				{/each}
				{#each groups as g (g.key)}
					{#if g.practices.length > 1 || g.practices[0].title !== g.title}<div class="goal">{g.title}</div>{/if}
					{#each g.practices as p (p.id)}
						<div class="name">
							<span>{p.title}</span>
							<span class="quick">
								<button disabled={busy} onclick={() => row(p, 'daily')}>каждый день</button>
								{#if p.defaultDays.length}<button disabled={busy} onclick={() => row(p, 'default')}>обычные дни</button>{/if}
								<button disabled={busy} onclick={() => row(p, 'clear')}>очистить</button>
							</span>
						</div>
						{#each days as d (d)}
							<button
								class="cell"
								class:on={isPlanned(p.id, d)}
								class:usual={p.defaultDays.includes(new Date(d + 'T12:00').getDay())}
								class:past={d < today}
								style={style(p.color)}
								disabled={d < today && !isPlanned(p.id, d)}
								aria-pressed={isPlanned(p.id, d)}
								aria-label="{p.title}, {label(d)}{hasNote(p.id, d) ? ', есть заметка дня' : ''}"
								onclick={() => cellTap(p, d)}
							>{#if hasNote(p.id, d)}<svg class="has-note" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3.5h6M3 6h6M3 8.5h4" /></svg>{/if}</button>
						{/each}
					{/each}
				{/each}
			</div>
		</section>

		<section>
			<h2>3. Утвердить</h2>
			<label class="check"><input type="checkbox" bind:checked={saveTemplate} /> Сохранить как шаблон недели</label>
			{#if saveTemplate}
				<div class="save-choice" role="radiogroup" aria-label="Куда сохранить">
					<label class="radio"><input type="radio" bind:group={saveMode} value="new" /> Новый шаблон</label>
					{#each data.templates as t (t.id)}
						<label class="radio"><input type="radio" bind:group={saveMode} value={t.id} /> Заменить: {t.name}</label>
					{/each}
				</div>
				{#if saveMode === 'new'}
					<input class="text" bind:value={templateName} placeholder="Например, «Обычная неделя»" maxlength="100" aria-label="Имя шаблона недели" />
				{/if}
			{/if}
			<button class="primary" disabled={busy || (saveTemplate && saveMode === 'new' && !templateName.trim())} onclick={confirm}>Утвердить план</button>
		</section>
	{/if}
</main>

{#if manage && data}
	<div class="backdrop" role="presentation" onclick={() => (manage = false)}></div>
	<div class="menu manage" role="dialog" aria-label="Шаблоны недели">
		<div class="manage-head"><p>Шаблоны недели</p><button class="quiet small" onclick={() => (manage = false)}>Готово</button></div>
		{#if data.templates.length}
			<ul
				class="tpl-list"
				use:sortable={{
					preview: (ids) => (tplPreview = ids),
					drop: async (ids) => {
						tplPreview = ids;
						await saveOrder('template', ids).catch(() => (error = 'Порядок не сохранился'));
						await call(null);
						tplPreview = null;
					}
				}}
			>
				{#each inPreview(data.templates, tplPreview, (t) => t.id) as t (t.id)}
					<li data-id={t.id}>
						<input value={t.name} aria-label="Имя шаблона недели" oninput={(e) => renameTemplate(t.id, e.currentTarget.value)} />
						<button class="del" aria-label="Удалить шаблон недели «{t.name}»" title="Удалить" onclick={() => deleteTemplate(t.id, t.name)}>Удалить</button>
						<button class="grip" data-handle aria-label="{t.name}: перетащить" title="Перетащить"><GripVertical size={20} /></button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted small">Шаблонов недели пока нет. Сохраните план как шаблон недели при утверждении.</p>
		{/if}
		<label class="limit-label"
			>Мягкий лимит практик в плане
			<input class="text" bind:value={limitInput} inputmode="numeric" placeholder="без лимита" oninput={saveLimit} />
		</label>
	</div>
{/if}

{#if menu}
	{@const m = menu}
	<div class="backdrop" role="presentation" onclick={() => (menu = undefined)}></div>
	<div class="menu" role="dialog" aria-label="{m.p.title}, {label(m.d)}">
		<p>{m.p.title} · {label(m.d)}</p>
		<button
			onclick={() => {
				noteFor = m;
				menu = undefined;
			}}>Заметка дня{hasNote(m.p.id, m.d) ? '' : ' — добавить'}</button
		>
		{#if m.d >= today}<button class="danger" onclick={() => unplan(m.p, m.d)}>Убрать из плана</button>{/if}
		<button class="quiet" onclick={() => (menu = undefined)}>Отмена</button>
	</div>
{/if}

{#if noteFor}
	{@const n = noteFor}
	{#key `${n.p.id}|${n.d}`}
		<NoteSheet
			p={n.p}
			dateLabel={label(n.d)}
			amount={undefined}
			doc={noteOf(n.p.id, n.d)}
			noteTitle="План дня"
			showDose={false}
			extraLabel="На все дни недели"
			onExtra={() => copyToWeek(n.p, n.d)}
			onDose={() => {}}
			onNote={(doc) => saveDayNote(n.p, n.d, doc)}
			onClose={() => (noteFor = undefined)}
		/>
	{/key}
{/if}

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 12px calc(env(safe-area-inset-bottom) + 32px);
	}
	h2 {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 20px 0 8px;
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 13px;
		margin: 6px 0;
	}
	button {
		cursor: pointer;
	}
	.sources {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.sources button,
	.pick button,
	.primary {
		min-height: 44px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 15px;
	}
	.pick {
		list-style: none;
		padding: 0;
		margin: 8px 0 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.pick button {
		width: 100%;
		text-align: left;
		padding: 0 12px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(118px, 2.1fr) repeat(7, minmax(0, 1fr));
		gap: 6px;
		align-items: center;
	}
	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: 12px;
		color: var(--muted);
		padding: 4px 0;
		border-radius: 8px;
	}
	.day b {
		font-size: 15px;
		color: var(--text);
	}
	.day.is-today {
		background: var(--today);
		color: var(--bg);
	}
	.day.is-today b {
		color: var(--bg);
	}
	.goal {
		grid-column: 1 / -1;
		font-size: 13px;
		font-weight: 600;
		margin-top: 8px;
	}
	.name {
		display: flex;
		flex-direction: column;
		font-size: 14px;
		line-height: 1.2;
		padding-left: 8px;
		hyphens: auto;
		-webkit-hyphens: auto;
	}
	.quick {
		display: flex;
		flex-wrap: wrap;
		gap: 0 8px;
	}
	.quick button {
		border: none;
		background: none;
		padding: 4px 0;
		font-size: 11px;
		color: var(--muted);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.cell {
		--c: var(--c-light);
		aspect-ratio: 1;
		width: 100%;
		border-radius: 8px;
		border: 1.5px dashed var(--line);
		background: transparent;
		padding: 0;
		touch-action: manipulation;
	}
	@media (prefers-color-scheme: dark) {
		.cell {
			--c: var(--c-dark);
		}
	}
	/* usual days of the practice: a faint hint */
	.cell.usual {
		background: color-mix(in oklab, var(--c) 12%, transparent);
	}
	.cell.on {
		border: 2px solid var(--c);
		background: color-mix(in oklab, var(--c) 22%, transparent);
	}
	.cell {
		position: relative;
	}
	.cell.past:not(:disabled) {
		opacity: 0.6;
	}
	.has-note {
		position: absolute;
		inset: 0;
		margin: auto;
		width: 55%;
		height: 55%;
		fill: none;
		stroke: var(--c);
		stroke-width: 1.4;
		stroke-linecap: round;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.35);
		z-index: 10;
	}
	.menu {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 11;
		max-width: 560px;
		margin: 0 auto;
		background: var(--surface);
		border-radius: 16px 16px 0 0;
		padding: 14px 16px calc(env(safe-area-inset-bottom) + 14px);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.manage {
		max-height: 80vh;
		overflow-y: auto;
	}
	.manage-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.menu button.small {
		min-height: 36px;
		padding: 0 12px;
	}
	.tpl-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.tpl-list li {
		display: flex;
		align-items: center;
		gap: 6px;
		border-radius: 10px;
	}
	.tpl-list input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0 10px;
		font-size: 16px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
	}
	.menu .del {
		min-height: 44px;
		padding: 0 10px;
		font-size: 14px;
		color: #b5541b;
	}
	.menu .grip {
		width: 44px;
		border: none;
		background: none;
		color: var(--muted);
		touch-action: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.limit-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 8px;
		font-size: 13px;
		color: var(--muted);
	}
	:global(.tpl-list li.dragging) {
		background: var(--bg);
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.18);
	}
	.menu p {
		margin: 0 0 4px;
		font-weight: 600;
	}
	.menu button {
		min-height: 48px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		font-size: 16px;
	}
	.menu .danger {
		color: #b5541b;
	}
	.menu .quiet {
		background: none;
		border: none;
		color: var(--muted);
	}
	.cell:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.warn {
		background: color-mix(in oklab, #c98a06 18%, var(--surface));
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 14px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-size: 15px;
	}
	.check input {
		width: 20px;
		height: 20px;
	}
	.text {
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
		font-size: 17px;
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		margin-bottom: 10px;
	}
	.primary {
		width: 100%;
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
	}
	.primary:disabled {
		opacity: 0.4;
	}
	.error {
		background: color-mix(in oklab, #c98a06 18%, var(--surface));
		padding: 10px 14px;
		border-radius: 10px;
	}
	.done {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 24px;
	}
</style>
