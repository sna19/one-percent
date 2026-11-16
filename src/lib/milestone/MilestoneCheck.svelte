<script lang="ts">
	import { goto } from '$app/navigation';
	import { addDays, type DateStr } from '../dates.js';
	import type { MilestoneView } from '../milestones.js';
	import NoteView from '../NoteView.svelte';

	/**
	 * Spec 009 E — «Майлстон — срок. Достигнут?»: «Да» closes it as achieved and offers the next one;
	 * «Нет» asks one diagnosis question, then «Новый срок» (the same one open again) or «Новый майлстон»;
	 * «Позже» hides the card until tomorrow. No notifications, no red.
	 */
	interface Props {
		m: MilestoneView;
		today: DateStr;
		/** «Сегодня» shows the heading and «Позже»; the goal screen does not need them */
		onToday?: boolean;
		/** after any change: reload */
		onChanged: () => void;
		/** where the screen came from, for the goal screen's back link */
		from?: string;
	}
	let { m, today, onToday = false, onChanged, from = 'today' }: Props = $props();

	const REASONS = [
		'Делал регулярно, но не то — сменю содержание действия',
		'Делал редко — уменьшу действие или сменю время',
		'Планка была слишком высокой',
		'Цель больше не важна'
	];

	let step = $state<'ask' | 'yes' | 'why' | 'next'>('ask');
	let busy = $state(false);
	let error = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
	let newDue = $state(addDays(today, 28));

	async function call(body: Record<string, unknown>) {
		busy = true;
		error = null;
		try {
			const r = await fetch('/api/milestones', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ today, ...body })
			});
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? 'Не получилось');
			return true;
		} catch (e) {
			error = (e as Error).message === 'Failed to fetch' ? 'Нет связи с сервером' : (e as Error).message;
			return false;
		} finally {
			busy = false;
		}
	}

	async function yes() {
		if (await call({ action: 'close', id: m.id, status: 'achieved' })) step = 'yes';
	}
	async function why(reason: string) {
		if (await call({ action: 'close', id: m.id, status: 'missed', reviewNote: reason })) step = 'next';
	}
	async function later() {
		if (await call({ action: 'snooze', id: m.id })) onChanged();
	}
	async function redate() {
		if (await call({ action: 'reopen', id: m.id, dueDate: newDue })) onChanged();
	}
	const newOne = () => goto(`/settings/goal/${m.goalId}?${from === 'settings' ? '' : `from=${from}&`}new=1`, { invalidateAll: true }).then(onChanged);
</script>

<div class="check">
	{#if step === 'ask'}
		{#if onToday}<p class="q">Майлстон «{m.title}» — срок. Достигнут?</p>{:else}<p class="q">Достигнут?</p>{/if}
		{#if onToday && m.criterion}<div class="crit"><NoteView doc={m.criterion} readonly /></div>{/if}
		<div class="row">
			<button disabled={busy} onclick={yes}>Да</button>
			<button disabled={busy} onclick={() => (step = 'why')}>Нет</button>
			{#if onToday}<button class="quiet" disabled={busy} onclick={later}>Позже</button>{/if}
		</div>
	{:else if step === 'yes'}
		<p class="q">Достигнут. Хорошая работа.</p>
		<div class="row">
			<button disabled={busy} onclick={newOne}>Поставить следующий</button>
			<button class="quiet" onclick={onChanged}>Не сейчас</button>
		</div>
	{:else if step === 'why'}
		<p class="q">Что помешало?</p>
		<div class="col">
			{#each REASONS as r (r)}<button disabled={busy} onclick={() => why(r)}>{r}</button>{/each}
		</div>
	{:else}
		<p class="q">Что дальше?</p>
		<div class="row wrap">
			<label class="due">Новый срок <input type="date" bind:value={newDue} min={today} /></label>
			<button disabled={busy || !newDue} onclick={redate}>Продлить</button>
		</div>
		<div class="row">
			<button disabled={busy} onclick={newOne}>Новый майлстон</button>
			<button class="quiet" onclick={onChanged}>Не сейчас</button>
		</div>
	{/if}
	{#if error}<p class="err" role="alert">{error}</p>{/if}
</div>

<style>
	.check {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.q {
		margin: 0;
		font-weight: 600;
	}
	.crit {
		font-size: 14px;
		color: var(--muted);
	}
	.row,
	.col {
		display: flex;
		gap: 8px;
	}
	.wrap {
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.col {
		flex-direction: column;
	}
	button {
		min-height: 44px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: 15px;
		text-align: left;
		cursor: pointer;
	}
	.row button {
		text-align: center;
	}
	.quiet {
		border-color: transparent;
		background: none;
		color: var(--muted);
	}
	.due {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
		color: var(--muted);
	}
	.due input {
		min-height: 44px;
		padding: 0 8px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.err {
		margin: 0;
		font-size: 14px;
	}
</style>
