<script lang="ts">
	import { page } from '$app/state';
	import { backFrom } from '#lib/back.js';
	import { goto } from '$app/navigation';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { todayStr } from '#lib/dates.js';
	import TopBar from '#lib/TopBar.svelte';
	import NoteSheet from '#lib/NoteSheet.svelte';
	import { autosaver } from '#lib/autosave.svelte.js';
	import { firstLine, type NoteDoc } from '#lib/note.js';
	import { parseDays } from '#lib/days.js';
	import Archive from '@lucide/svelte/icons/archive';
	import FilePen from '@lucide/svelte/icons/file-pen';
	import type { PracticeView } from '#lib/types.js';
	import type { PageProps } from './$types';

	/** Spec 007 C — one practice on its own screen; every change saves itself. */
	let { data }: PageProps = $props();
	// #22: opened from a goal screen («+ Практика» or its list) — back to that goal
	const backLink = $derived.by(() => {
		const q = page.url.searchParams;
		const gid = Number(q.get('goal'));
		const g = gid ? data.goals.find((x) => x.id === gid) : undefined;
		if (g) return { label: g.title, href: `/settings/goal/${g.id}${q.get('from') ? `?from=${q.get('from')}` : ''}` };
		return q.get('from') ? backFrom(q) : { label: 'Настройки', href: '/settings' };
	});
	// the form starts from the loaded values once; later it is the source of truth
	const p0 = untrack(() => data.practice);

	// #24: the volume
	const today = todayStr();
	let volTotal = $state(p0.volumeTotal != null ? String(p0.volumeTotal) : '');
	let volAt = $state('');
	let volError = $state<string | null>(null);
	onMount(async () => {
		if (p0.volumeTotal == null) return;
		const r = await fetch(`/api/volume?practiceId=${p0.id}&today=${today}`).catch(() => undefined);
		if (r?.ok) volAt = String((await r.json()).position);
	});
	async function saveVolume() {
		volError = null;
		const total = volTotal.trim() ? Number(volTotal.replace(',', '.')) : null;
		const at = volAt.trim() ? Number(volAt.replace(',', '.')) : undefined;
		const r = await fetch('/api/volume', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'set', practiceId: p0.id, today, total, at })
		}).catch(() => undefined);
		const j = await r?.json().catch(() => null);
		if (!r?.ok) volError = j?.message ?? 'Нет связи с сервером';
		else volAt = j.position != null ? String(j.position) : '';
	}

	let title = $state(p0.title);
	let goalId = $state(p0.goalId);
	let formatId = $state<number | ''>(p0.formatId ?? '');
	let unit = $state(p0.unit);
	let minDose = $state(String(p0.minDose));
	let normDose = $state(String(p0.normDose));
	let days = $state<number[]>(parseDays(p0.defaultDays));
	let showNoteFull = $state(p0.showNoteFull);
	let checklistMarks = $state(p0.checklistMarks);
	let recommended = $state(p0.recommended);
	let note = $state<NoteDoc | null>(p0.note ? JSON.parse(p0.note) : null);
	let editing = $state(false);

	const saver = autosaver('practice');
	function changed() {
		saver.save({
			id: p0.id,
			title,
			goalId,
			formatId: formatId === '' ? '' : formatId,
			unit,
			minDose,
			normDose,
			defaultDays: days,
			showNoteFull,
			checklistMarks,
			recommended
		});
	}
	onDestroy(() => saver.flush());

	const toggleDay = (d: number) => {
		days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
		changed();
	};

	async function saveNote(doc: NoteDoc | null) {
		note = doc;
		await fetch('/api/note', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ practiceId: p0.id, note: doc, updatedAt: new Date().toISOString() })
		});
	}

	async function archive() {
		await saver.flush();
		await fetch('/api/settings/archive', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ kind: 'practice', id: p0.id })
		});
		goto('/settings');
	}

	const WD = [1, 2, 3, 4, 5, 6, 0];
	const NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
	const goalsActive = $derived(data.goals.filter((g) => !g.archivedAt || g.id === p0.goalId));
	const formatsActive = $derived(data.formats.filter((f) => !f.archivedAt || f.id === p0.formatId));
	const asView = $derived({ ...p0, title, note, goalTitle: '', color: 'slate' } as unknown as PracticeView);
</script>

<svelte:head><title>{title} · Настройки</title></svelte:head>

<main>
	<TopBar help="practice" title={title || 'Практика'} back={backLink} menu={[{ label: 'В архив', icon: Archive, onclick: archive }]} />

	<p class="status" aria-live="polite">
		{saver.state.status === 'saving' ? 'Сохраняю…' : saver.state.status === 'saved' ? 'Сохранено' : saver.state.status === 'error' ? saver.state.message : ''}
	</p>

	<div class="card">
		<label>Название <input bind:value={title} oninput={changed} /></label>
		<label
			>Цель
			<select bind:value={goalId} onchange={changed}>
				{#each goalsActive as g (g.id)}<option value={g.id}>{g.title}</option>{/each}
			</select>
		</label>
		<label
			>Формат
			<select bind:value={formatId} onchange={changed}>
				<option value="">Без формата</option>
				{#each formatsActive as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
			</select>
		</label>
		<div class="three">
			<label>Единица <input bind:value={unit} oninput={changed} /></label>
			<label>Минимум <input bind:value={minDose} inputmode="decimal" oninput={changed} /></label>
			<label>Норма <input bind:value={normDose} inputmode="decimal" oninput={changed} /></label>
		</div>
	</div>

	<!-- #24: a finite practice (a book): the whole volume and where you are now -->
	<h2>Объём — если у практики есть конец</h2>
	<div class="card">
		<div class="three">
			<label>Всего, {unit} <input bind:value={volTotal} inputmode="decimal" placeholder="—" onchange={saveVolume} /></label>
			<label>Сейчас на <input bind:value={volAt} inputmode="decimal" placeholder="0" disabled={!volTotal.trim()} onchange={saveVolume} /></label>
		</div>
		<p class="hint">{volTotal.trim() ? 'Позиция растёт сама по отметкам; «Сейчас на» — поправить, где ты на самом деле.' : 'Пусто — практика бесконечная, как обычно.'}</p>
		{#if volError}<p class="hint" role="alert">{volError}</p>{/if}
	</div>

	<h2>Обычные дни — для планирования</h2>
	<div class="card">
		<div class="weekdays" role="group" aria-label="Обычные дни">
			{#each WD as d (d)}
				<button class="wd" class:on={days.includes(d)} aria-pressed={days.includes(d)} onclick={() => toggleDay(d)}>{NAMES[d]}</button>
			{/each}
		</div>
	</div>

	<h2>«Сделать что-то ещё»</h2>
	<div class="card">
		<label class="toggle"><input type="checkbox" bind:checked={recommended} onchange={changed} /> Рекомендовать — показывать первой, даже когда не в плане</label>
	</div>

	<h2>План дня</h2>
	<div class="card">
		<label class="toggle"><input type="checkbox" bind:checked={showNoteFull} onchange={changed} /> Показывать заметку дня целиком</label>
		<label class="toggle"><input type="checkbox" bind:checked={checklistMarks} onchange={changed} /> Отметка по чеклисту заметки дня</label>
	</div>

	<h2 class="with-icon"><FilePen size={14} />Заметка «Всегда» — для всех дней</h2>
	<div class="card">
		<p class="note-line">{firstLine(note) || 'Пока пусто'}</p>
		<button class="edit" onclick={() => (editing = true)}>Изменить заметку</button>
	</div>
</main>

{#if editing}
	<NoteSheet
		p={asView}
		dateLabel="общая заметка"
		amount={undefined}
		doc={note}
		head={{ kind: 'practice' }}
		showDose={false}
		onDose={() => {}}
		onNote={(doc) => saveNote(doc)}
		onClose={() => (editing = false)}
	/>
{/if}

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px calc(env(safe-area-inset-bottom) + 32px);
	}
	.status {
		min-height: 18px;
		margin: -4px 0 6px;
		font-size: 13px;
		color: var(--muted);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--muted);
	}
	h2 {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 22px 0 8px;
	}
	.with-icon {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		background: var(--surface);
		border-radius: 12px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
		color: var(--muted);
	}
	input:not([type='checkbox']),
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
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px;
	}
	.wd {
		min-height: 44px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		font-size: 14px;
		cursor: pointer;
	}
	.wd.on {
		background: var(--text);
		border-color: var(--text);
		color: var(--bg);
	}
	.toggle {
		flex-direction: row;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		font-size: 16px;
		color: var(--text);
	}
	.toggle input {
		width: 22px;
		height: 22px;
	}
	.note-line {
		margin: 0;
		color: var(--text);
	}
	.edit {
		align-self: flex-start;
		min-height: 44px;
		padding: 0 14px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
</style>
