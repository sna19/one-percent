<script lang="ts">
	import { addDays, type DateStr } from '../dates.js';
	import { docToPlain, plainToDoc } from '../inbox.js';
	import type { MilestoneView } from '../milestones.js';

	/** Spec 009 D — create or change a milestone: short name, yes/no criterion, dates, an optional budget. */
	interface Props {
		goalId: number;
		/** the milestone being changed; none — a new one */
		m?: MilestoneView | null;
		units: string[];
		today: DateStr;
		onDone: () => void;
		onCancel: () => void;
	}
	let { goalId, m = null, units, today, onDone, onCancel }: Props = $props();

	// svelte-ignore state_referenced_locally
	const init = m;
	let title = $state(init?.title ?? '');
	let criterion = $state(init?.criterion ? docToPlain(init.criterion) : '');
	// svelte-ignore state_referenced_locally
	let startDate = $state(init?.startDate ?? today);
	// svelte-ignore state_referenced_locally
	let dueDate = $state(init?.dueDate ?? addDays(today, 56));
	let kind = $state<MilestoneView['budgetKind']>(init?.budgetKind ?? 'none');
	// svelte-ignore state_referenced_locally
	let unit = $state(init?.budgetUnit ?? units[0] ?? 'мин');
	let target = $state(init?.budgetTarget ? String(init.budgetTarget) : '');
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = null;
		const body = {
			action: init ? 'update' : 'create',
			id: init?.id,
			goalId,
			today,
			title,
			criterion: criterion.trim() ? plainToDoc(criterion) : null,
			startDate,
			dueDate: dueDate || null,
			budgetKind: kind,
			budgetUnit: kind === 'amount' ? unit : null,
			budgetTarget: kind === 'none' ? null : Number(String(target).replace(',', '.'))
		};
		try {
			const r = await fetch('/api/milestones', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? 'Не получилось');
			onDone();
		} catch (e) {
			error = (e as Error).message === 'Failed to fetch' ? 'Нет связи с сервером' : (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<form class="card" onsubmit={save}>
	<label>Коротко — для карточки <input bind:value={title} maxlength="40" placeholder="Например, «Разговор 15 мин»" required /></label>
	<label
		>Критерий
		<textarea bind:value={criterion} rows="3" placeholder="Как ты поймёшь, что дошёл? Ответ — да или нет"></textarea>
	</label>
	<div class="two">
		<label>Начало <input type="date" bind:value={startDate} /></label>
		<label>Срок <input type="date" bind:value={dueDate} min={startDate} /><small>обычно 1–3 месяца</small></label>
	</div>
	<fieldset>
		<legend>Бюджет</legend>
		<div class="seg" role="radiogroup" aria-label="Бюджет">
			<button type="button" role="radio" aria-checked={kind === 'none'} class:on={kind === 'none'} onclick={() => (kind = 'none')}>Без бюджета</button>
			<button type="button" role="radio" aria-checked={kind === 'sessions'} class:on={kind === 'sessions'} onclick={() => (kind = 'sessions')}>Занятия</button>
			<button type="button" role="radio" aria-checked={kind === 'amount'} class:on={kind === 'amount'} onclick={() => (kind = 'amount')}>Количество</button>
		</div>
		{#if kind === 'sessions'}
			<label>Сколько дней с отметкой <input bind:value={target} inputmode="numeric" placeholder="20" /></label>
		{:else if kind === 'amount'}
			<div class="two">
				<label>Сколько <input bind:value={target} inputmode="decimal" placeholder="720" /></label>
				<label
					>Единица
					<select bind:value={unit}>
						{#each units.length ? units : ['мин'] as u (u)}<option value={u}>{u}</option>{/each}
					</select>
				</label>
			</div>
			<small>Считается всё, что отмечено в практиках цели с этой единицей, от начала.</small>
		{/if}
	</fieldset>
	{#if error}<p class="err" role="alert">{error}</p>{/if}
	<div class="actions">
		<button type="button" class="quiet" onclick={onCancel}>Отмена</button>
		<button type="submit" class="primary" disabled={busy}>{init ? 'Сохранить' : 'Поставить'}</button>
	</div>
</form>

<style>
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
		min-width: 0;
	}
	input,
	select,
	textarea {
		font: inherit;
		font-size: 17px;
		min-height: 44px;
		padding: 8px 10px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		width: 100%;
		box-sizing: border-box;
	}
	small {
		font-size: 12px;
		color: var(--muted);
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	fieldset {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	legend {
		font-size: 13px;
		color: var(--muted);
		margin-bottom: 4px;
	}
	.seg {
		display: flex;
		gap: 4px;
		padding: 3px;
		border-radius: 10px;
		background: var(--bg);
	}
	.seg button {
		flex: 1;
		min-height: 36px;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface);
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
		font-weight: 600;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.actions button {
		min-height: 44px;
		padding: 0 16px;
		border-radius: 10px;
		font: inherit;
		cursor: pointer;
	}
	.quiet {
		border: none;
		background: none;
		color: var(--muted);
	}
	.primary {
		border: none;
		background: var(--text);
		color: var(--bg);
		font-weight: 600 !important;
	}
	.err {
		margin: 0;
		font-size: 14px;
	}
</style>
