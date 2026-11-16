<script lang="ts">
	import { onMount } from 'svelte';
	import { addDays, weekDays, weekStart, type DateStr } from './dates.js';
	import { counts } from './rules.js';
	import { dayTitle } from './today.js';
	import type { PlanView, PracticeView } from './types.js';

	/**
	 * Spec 012 B — «Когда»: plan a practice from its card. Seven days of this or next week (past days are
	 * off); a tap plans or unplans a day at once. «Перенести на завтра» moves the day of the card (with its
	 * day note) to the next day; «Ещё и завтра» adds the next day. «Открыть в плане недели» — the editor at
	 * this practice's row.
	 */
	interface Props {
		p: PracticeView;
		/** the day the card is shown for */
		day: DateStr;
		today: DateStr;
		/** the practice's amount on `day`, to know whether it is done */
		amount: number | undefined;
		from: string;
		onClose: () => void;
		onChanged: () => void;
	}
	let { p, day, today, amount, from, onClose, onChanged }: Props = $props();

	const thisWeek = $derived(weekStart(today));
	// svelte-ignore state_referenced_locally
	let start = $state(weekStart(day) === weekStart(today) ? weekStart(today) : addDays(weekStart(today), 7));
	let plans = $state<Record<DateStr, PlanView | null>>({});
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function loadWeek(s: DateStr) {
		const r = await fetch(`/api/plan?start=${s}&today=${today}`).catch(() => undefined);
		if (!r?.ok) {
			error = 'Нет связи с сервером';
			return;
		}
		plans[s] = (await r.json()).plan;
	}
	onMount(() => Promise.all([loadWeek(thisWeek), loadWeek(addDays(thisWeek, 7))]));

	const isPlanned = (d: DateStr) => (plans[weekStart(d)]?.items[p.id] ?? []).includes(d);
	const hasNote = (d: DateStr) => !!plans[weekStart(d)]?.notes[`${p.id}|${d}`];
	const tomorrow = $derived(addDays(day, 1));
	const lastDay = $derived(addDays(thisWeek, 13));
	const done = $derived(counts(amount, p));

	async function post(body: Record<string, unknown>) {
		busy = true;
		error = null;
		try {
			const r = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ today, ...body }) });
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? 'Не сохранилось');
			const touched = new Set([weekStart(String(body.date)), weekStart(String(body.to ?? body.date))]);
			await Promise.all([...touched].map(loadWeek));
			onChanged();
			return true;
		} catch (e) {
			error = (e as Error).message === 'Failed to fetch' ? 'Нет связи с сервером' : (e as Error).message;
			return false;
		} finally {
			busy = false;
		}
	}

	function toggle(d: DateStr) {
		const on = isPlanned(d);
		if (on && hasNote(d) && !confirm(`Убрать ${dayTitle(d).toLowerCase()} из плана? Заметка этого дня удалится.`)) return;
		post({ action: 'item', start: weekStart(d), practiceId: p.id, date: d, planned: !on });
	}
	async function move() {
		if (await post({ action: 'move', start: weekStart(day), practiceId: p.id, date: day, to: tomorrow })) onClose();
	}
	const alsoTomorrow = () => post({ action: 'item', start: weekStart(tomorrow), practiceId: p.id, date: tomorrow, planned: true });

	const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
	const canMove = $derived(day >= today && isPlanned(day) && !done && tomorrow <= lastDay);
	const canAlso = $derived(tomorrow >= today && tomorrow <= lastDay && !isPlanned(tomorrow));
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="sheet" role="dialog" aria-label="Когда: {p.title}">
	<header>
		<div>
			<p class="title">Когда</p>
			<p class="sub">{p.title}</p>
		</div>
		<button class="done" onclick={onClose}>Готово</button>
	</header>

	<div class="seg" role="radiogroup" aria-label="Неделя">
		<button role="radio" aria-checked={start === thisWeek} class:on={start === thisWeek} onclick={() => (start = thisWeek)}>Эта неделя</button>
		<button role="radio" aria-checked={start !== thisWeek} class:on={start !== thisWeek} onclick={() => (start = addDays(thisWeek, 7))}>Следующая</button>
	</div>

	<div class="days" role="group" aria-label="Дни недели">
		{#each weekDays(start) as d (d)}
			{@const on = isPlanned(d)}
			<button
				class="d"
				class:on
				class:cur={d === day}
				disabled={busy || d < today || !plans[start] && plans[start] !== null}
				aria-pressed={on}
				aria-label="{dayTitle(d)}: {on ? 'в плане' : 'не в плане'}"
				onclick={() => toggle(d)}><small>{DAYS[new Date(`${d}T12:00`).getDay()]}</small><b>{Number(d.slice(8))}</b></button
			>
		{/each}
	</div>

	<div class="quick">
		<button disabled={busy || !canMove} onclick={move}>Перенести на завтра</button>
		<button disabled={busy || !canAlso} onclick={alsoTomorrow}>Ещё и завтра</button>
	</div>
	{#if done && isPlanned(day)}<p class="hint">Сегодня уже сделано — переносить нечего.</p>{/if}
	{#if error}<p class="hint" role="alert">{error}</p>{/if}

	<a class="open" href="/plan?start={weekStart(day) < thisWeek ? thisWeek : weekStart(day)}&from={from}&focus={p.id}">Открыть в плане недели</a>
</div>

<style>
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
		gap: 12px;
		padding: 12px 16px calc(env(safe-area-inset-bottom) + 14px);
		background: var(--surface);
		border-radius: 16px 16px 0 0;
		box-shadow: 0 -10px 30px rgb(0 0 0 / 0.2);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}
	.title {
		margin: 0;
		font-weight: 700;
		font-size: 17px;
	}
	.sub {
		margin: 0;
		color: var(--muted);
		font-size: 14px;
	}
	.done {
		min-height: 44px;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
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
	.days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px;
	}
	.d {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 52px;
		border: 2px solid var(--line);
		border-radius: 12px;
		background: none;
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.d small {
		font-size: 11px;
		color: var(--muted);
	}
	.d.on {
		background: var(--text);
		border-color: var(--text);
		color: var(--bg);
	}
	.d.on small {
		color: inherit;
		opacity: 0.8;
	}
	.d.cur {
		outline: 2px dashed var(--muted);
		outline-offset: 2px;
	}
	.d:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.quick {
		display: flex;
		gap: 8px;
	}
	.quick button {
		flex: 1;
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: 15px;
		cursor: pointer;
	}
	.quick button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--muted);
	}
	.open {
		align-self: flex-start;
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		color: var(--link);
		text-decoration: none;
		font-size: 15px;
	}
</style>
