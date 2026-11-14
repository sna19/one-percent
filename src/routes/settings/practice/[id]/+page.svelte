<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy, untrack } from 'svelte';
	import TopBar from '#lib/TopBar.svelte';
	import NoteSheet from '#lib/NoteSheet.svelte';
	import { autosaver } from '#lib/autosave.svelte.js';
	import { firstLine, type NoteDoc } from '#lib/note.js';
	import { parseDays } from '#lib/days.js';
	import Archive from '@lucide/svelte/icons/archive';
	import type { PracticeView } from '#lib/types.js';
	import type { PageProps } from './$types';

	/** Spec 007 C — one practice on its own screen; every change saves itself. */
	let { data }: PageProps = $props();
	// the form starts from the loaded values once; later it is the source of truth
	const p0 = untrack(() => data.practice);

	let title = $state(p0.title);
	let goalId = $state(p0.goalId);
	let formatId = $state<number | ''>(p0.formatId ?? '');
	let unit = $state(p0.unit);
	let minDose = $state(String(p0.minDose));
	let normDose = $state(String(p0.normDose));
	let days = $state<number[]>(parseDays(p0.defaultDays));
	let showNoteFull = $state(p0.showNoteFull);
	let checklistMarks = $state(p0.checklistMarks);
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
			checklistMarks
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
	<TopBar title={title || 'Практика'} back={{ label: 'Настройки', href: '/settings' }} menu={[{ label: 'В архив', icon: Archive, onclick: archive }]} />

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

	<h2>Обычные дни — для планирования</h2>
	<div class="card">
		<div class="weekdays" role="group" aria-label="Обычные дни">
			{#each WD as d (d)}
				<button class="wd" class:on={days.includes(d)} aria-pressed={days.includes(d)} onclick={() => toggleDay(d)}>{NAMES[d]}</button>
			{/each}
		</div>
	</div>

	<h2>План дня</h2>
	<div class="card">
		<label class="toggle"><input type="checkbox" bind:checked={showNoteFull} onchange={changed} /> Показывать заметку дня целиком</label>
		<label class="toggle"><input type="checkbox" bind:checked={checklistMarks} onchange={changed} /> Отметка по чеклисту заметки дня</label>
	</div>

	<h2>Постоянная заметка</h2>
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
		noteTitle="Постоянная заметка"
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
	h2 {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 22px 0 8px;
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
