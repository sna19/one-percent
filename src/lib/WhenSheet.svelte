<script lang="ts">
	import { onMount } from 'svelte';
	import { addDays, weekDays, weekStart, type DateStr } from './dates.js';
	import { counts } from './rules.js';
	import { dayTitle } from './today.js';
	import type { PlanView, PracticeView } from './types.js';

	/**
	 * Spec 012 B — «Когда»: plan a practice. Seven days of this or next week (past days are off); a tap plans
	 * or unplans a day at once; the practice's usual days (default_days) are marked. «И в шаблон …» repeats
	 * the change in the template the week was built from. From a card (`day` given) there are also
	 * «Перенести на завтра» and «Ещё и завтра»; from the goal screen and the navigator — «Обычные дни».
	 * «#19 + #22, уточнение»: one sheet everywhere; after a practice is added to a goal it opens itself as
	 * «Добавить в неделю?» with «Позже».
	 */
	interface Props {
		p: { id: number; title: string; defaultDays?: number[] };
		/** the day of the card it is opened from; without it the sheet is not about a card */
		day?: DateStr;
		today: DateStr;
		/** the practice's amount on `day`, to know whether it is done */
		amount?: number;
		from: string;
		heading?: string;
		/** «Позже» instead of «Готово» until something is planned */
		later?: boolean;
		onClose: () => void;
		onChanged: () => void;
	}
	let { p, day, today, amount, from, heading = 'Когда', later = false, onClose, onChanged }: Props = $props();

	const card = $derived(day !== undefined);
	const at = $derived(day ?? today);
	const thisWeek = $derived(weekStart(today));
	// svelte-ignore state_referenced_locally
	let start = $state(weekStart(day ?? today) === weekStart(today) ? weekStart(today) : addDays(weekStart(today), 7));
	let plans = $state<Record<DateStr, PlanView | null>>({});
	let tpls = $state<Record<DateStr, { id: number; name: string } | null>>({});
	// svelte-ignore state_referenced_locally
	let usual = $state<number[]>(p.defaultDays ?? []);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let touched = $state(false);

	// «И в шаблон» is remembered on the device: who keeps a template wants it every time
	let alsoTpl = $state(false);
	onMount(() => {
		try {
			alsoTpl = localStorage.getItem('when-template') === '1';
		} catch {
			/* private mode */
		}
	});
	function setAlso(v: boolean) {
		alsoTpl = v;
		try {
			localStorage.setItem('when-template', v ? '1' : '0');
		} catch {
			/* not critical */
		}
	}

	async function loadWeek(s: DateStr) {
		const r = await fetch(`/api/plan?start=${s}&today=${today}`).catch(() => undefined);
		if (!r?.ok) {
			error = 'Нет связи с сервером';
			return;
		}
		const j = await r.json();
		plans[s] = j.plan;
		tpls[s] = j.template ?? null;
		const me = (j.practices as PracticeView[]).find((x) => x.id === p.id);
		if (me) usual = me.defaultDays;
	}
	onMount(() => Promise.all([loadWeek(thisWeek), loadWeek(addDays(thisWeek, 7))]));

	const isPlanned = (d: DateStr) => (plans[weekStart(d)]?.items[p.id] ?? []).includes(d);
	const hasNote = (d: DateStr) => !!plans[weekStart(d)]?.notes[`${p.id}|${d}`];
	const isUsual = (d: DateStr) => usual.includes(new Date(`${d}T12:00`).getDay());
	const tomorrow = $derived(addDays(at, 1));
	const lastDay = $derived(addDays(thisWeek, 13));
	const done = $derived(card && counts(amount, p as PracticeView));
	const tpl = $derived(tpls[start] ?? null);

	async function post(body: Record<string, unknown>) {
		busy = true;
		error = null;
		try {
			const withTpl = alsoTpl && !!tpls[weekStart(String(body.date ?? body.start))];
			const r = await fetch('/api/plan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ today, ...body, ...(withTpl && body.action !== 'move' ? { template: true } : {}) })
			});
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? 'Не сохранилось');
			const weeks = new Set([weekStart(String(body.date ?? body.start)), weekStart(String(body.to ?? body.date ?? body.start))]);
			await Promise.all([...weeks].map(loadWeek));
			touched = true;
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
		if (await post({ action: 'move', start: weekStart(at), practiceId: p.id, date: at, to: tomorrow })) onClose();
	}
	const alsoTomorrow = () => post({ action: 'item', start: weekStart(tomorrow), practiceId: p.id, date: tomorrow, planned: true });
	const usualDays = () => post({ action: 'row', start, practiceId: p.id, mode: 'default' });

	const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
	const usualLabel = $derived([1, 2, 3, 4, 5, 6, 0].filter((d) => usual.includes(d)).map((d) => DAYS[d]).join(' '));
	const canMove = $derived(card && at >= today && isPlanned(at) && !done && tomorrow <= lastDay);
	const canAlso = $derived(tomorrow >= today && tomorrow <= lastDay && !isPlanned(tomorrow));
	const canUsual = $derived(usual.length > 0 && weekDays(start).some((d) => d >= today && isUsual(d) !== isPlanned(d)));
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="sheet" role="dialog" aria-label="{heading}: {p.title}">
	<header>
		<div>
			<p class="title">{heading}</p>
			<p class="sub">{p.title}</p>
		</div>
		<button class="done" onclick={onClose}>{later && !touched ? 'Позже' : 'Готово'}</button>
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
				class:cur={card && d === day}
				class:usual={isUsual(d)}
				disabled={busy || d < today || !plans[start] && plans[start] !== null}
				aria-pressed={on}
				aria-label="{dayTitle(d)}: {on ? 'в плане' : 'не в плане'}{isUsual(d) ? ', обычный день' : ''}"
				onclick={() => toggle(d)}><small>{DAYS[new Date(`${d}T12:00`).getDay()]}</small><b>{Number(d.slice(8))}</b></button
			>
		{/each}
	</div>

	{#if usual.length}<p class="hint">Точка — обычные дни практики: {usualLabel}</p>{/if}

	{#if tpl}
		<label class="tpl"><input type="checkbox" checked={alsoTpl} onchange={(e) => setAlso(e.currentTarget.checked)} />И в шаблон «{tpl.name}»</label>
	{/if}

	{#if card || usual.length}<div class="quick">
		{#if card}
			<button disabled={busy || !canMove} onclick={move}>Перенести на завтра</button>
			<button disabled={busy || !canAlso} onclick={alsoTomorrow}>Ещё и завтра</button>
		{:else if usual.length}
			<button disabled={busy || !canUsual} onclick={usualDays}>Обычные дни · {usualLabel}</button>
		{/if}
	</div>{/if}
	{#if done && day && isPlanned(day)}<p class="hint">Сегодня уже сделано — переносить нечего.</p>{/if}
	{#if error}<p class="hint" role="alert">{error}</p>{/if}

	<a class="open" href="/plan?start={start}&from={from}&focus={p.id}">Открыть в плане недели</a>
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
	/* the practice's usual day: a dot under the number */
	.d.usual b::after {
		content: '';
		display: block;
		width: 5px;
		height: 5px;
		margin: 2px auto 0;
		border-radius: 50%;
		background: currentColor;
	}
	.tpl {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		font-size: 15px;
	}
	.tpl input {
		width: 20px;
		height: 20px;
		margin: 0;
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
