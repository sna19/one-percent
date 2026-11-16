<script lang="ts">
	import { goto } from '$app/navigation';
	import FilePen from '@lucide/svelte/icons/file-pen';
	import Plus from '@lucide/svelte/icons/plus';
	import Target from '@lucide/svelte/icons/target';
	import Check from '@lucide/svelte/icons/check';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import DayIcon from '../DayIcon.svelte';
	import PracticeTree from '../PracticeTree.svelte';
	import { colorOf } from '../palette.js';
	import { treeOfPractices } from '../tree.js';
	import { dayTitle } from '../today.js';
	import { docToPlain, plainToDoc, type InboxItemView } from '../inbox.js';
	import type { PracticeView } from '../types.js';
	import { addDays, type DateStr } from '../dates.js';
	import { inbox } from './state.svelte.js';

	/**
	 * Spec 008 — one inbox item: its text (editable before sorting) and the six ways to sort it.
	 * Practices are picked from the same tree as in settings; a day note asks to plan the day if needed.
	 */
	interface Props {
		item: InboxItemView;
		practices: PracticeView[];
		today: DateStr;
		onClose: () => void;
		/** after an action that changed notes or the plan: reload the week */
		onChanged: () => void;
	}
	let { item, practices, today, onClose, onChanged }: Props = $props();

	type Step = 'menu' | 'practice' | 'day' | 'goal' | 'category';
	let step = $state<Step>('menu');
	// svelte-ignore state_referenced_locally
	let day = $state<DateStr>(today);
	let busy = $state(false);
	let textFull = $state(false);
	let error = $state<string | null>(null);
	// svelte-ignore state_referenced_locally
	let text = $state(docToPlain(item.text));
	// svelte-ignore state_referenced_locally
	const original = text;

	const sort = $derived(inbox.sort);
	const tree = $derived(treeOfPractices(practices));
	/** all goals by category, also those without practices — for «Новая практика» */
	const goalTree = $derived(
		(sort?.categories ?? []).map((c) => ({
			id: c.id,
			name: c.name,
			color: c.color,
			goals: (sort?.goals ?? []).filter((g) => g.categoryId === c.id).map((g) => ({ ...g, practices: [] as PracticeView[] }))
		}))
	);
	const plannedOn = $derived(new Set(sort?.planned[day] ?? []));
	const plannedList = $derived(practices.filter((p) => plannedOn.has(p.id)));

	async function saveText() {
		if (item.id === null || !text.trim() || text === original) return;
		try {
			await inbox.act({ action: 'edit', id: item.id, text: plainToDoc(text) });
		} catch {
			/* kept on screen; the next sort uses the old text */
		}
	}

	async function close() {
		await saveText();
		await inbox.load();
		onClose();
	}

	async function run(body: Record<string, unknown>, done: string, after?: (r: Record<string, unknown>) => void) {
		busy = true;
		error = null;
		try {
			await saveText();
			const r = await inbox.act({ id: item.id, ...body });
			inbox.say(done);
			await inbox.load();
			onChanged();
			onClose();
			after?.(r);
		} catch (e) {
			const err = e as Error & { status?: number };
			if (err.status === 409 && body.action === 'dayNote') {
				const p = practices.find((x) => x.id === body.practiceId);
				if (day < today) error = 'Этот день прошёл — в его план ничего не добавить';
				else if (confirm(`«${p?.title}» нет в плане на ${dayTitle(day).toLowerCase()}. Добавить в план и записать?`))
					return run({ ...body, addToPlan: true }, done, after);
			} else error = err.message;
		} finally {
			busy = false;
		}
	}

	const toPractice = (p: PracticeView) => run({ action: 'practiceNote', practiceId: p.id }, `В заметку «Всегда»: ${p.title}`);
	const toDay = (p: PracticeView) => run({ action: 'dayNote', practiceId: p.id, date: day, today }, `В заметку дня: ${p.title}`);
	const newPractice = (goalId: number) =>
		run({ action: 'newPractice', goalId }, 'Новая практика', (r) => goto(`/settings/practice/${r.practiceId}?from=inbox`));
	const newGoal = (categoryId: number) => run({ action: 'newGoal', categoryId }, 'Новая цель', (r) => goto(`/settings/goal/${r.goalId}?from=inbox`));
	const close2 = (action: 'done' | 'delete') => {
		inbox.close(item, action);
		onClose();
	};

	const dayLabel = (d: DateStr) => (d === today ? 'Сегодня' : d === addDays(today, 1) ? 'Завтра' : dayTitle(d));
	const TITLES: Record<Step, string> = {
		menu: 'Запись',
		practice: 'В заметку практики',
		day: 'В заметку дня',
		goal: 'Новая практика: цель',
		category: 'Новая цель: категория'
	};
</script>

{#snippet practiceButton(p: PracticeView, pick: (p: PracticeView) => void, mark = '')}
	<li>
		<button class="row" disabled={busy} onclick={() => pick(p)}>
			<span class="dot" style="--c:{colorOf(p.color).light}"></span>{p.title}{#if p.goalTitle !== p.title}<small>{p.goalTitle}</small>{/if}
			{#if mark}<em>{mark}</em>{/if}
		</button>
	</li>
{/snippet}

{#snippet practiceTree(pick: (p: PracticeView) => void, markPlanned: boolean)}
	<!-- #25: the practice navigator in «pick one» mode -->
	<PracticeTree
		{tree}
		storageKey="inbox-pick-tree"
		mode="one"
		onPick={(p) => !busy && pick(p)}
		note={markPlanned ? (p) => (plannedOn.has(p.id) ? 'в плане' : '') : undefined}
		chips={[{ key: 'star', label: '★ Рекомендовать', keep: (p) => p.recommended }]}
	/>
{/snippet}

<div class="backdrop" role="presentation" onclick={close}></div>
<div class="sheet" role="dialog" aria-label={TITLES[step]}>
	<header>
		{#if step === 'menu'}
			<span class="title">{TITLES.menu}</span>
		{:else}
			<button class="back" onclick={() => (step = 'menu')}><ChevronLeft size={20} />{TITLES[step]}</button>
		{/if}
		<button class="done" onclick={close}>Готово</button>
	</header>
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<div class="body">
		{#if step === 'menu'}
			{#if item.pending}
				<p class="muted">Запись ещё не отправлена: разобрать её можно, когда будет связь.</p>
				<p class="text">{text}</p>
			{:else}
				<!-- #23: ⤢ opens the text on the whole screen -->
				<div class="tf" class:full={textFull}>
					{#if textFull}<div class="full-head"><span>Запись</span><button class="done" onclick={() => (textFull = false)}>Готово</button></div>{/if}
					<textarea bind:value={text} rows="3" aria-label="Текст записи"></textarea>
					{#if !textFull}<button class="expand" aria-label="На весь экран" onclick={() => (textFull = true)}><Maximize2 size={16} /></button>{/if}
				</div>
			{/if}
			<ul class="actions">
				{#if !item.pending}
					<li><button disabled={busy} onclick={() => (step = 'practice')}><FilePen size={20} />В заметку практики</button></li>
					<li><button disabled={busy} onclick={() => (step = 'day')}><DayIcon day={Number(today.slice(8))} size={20} />В заметку дня</button></li>
					<li><button disabled={busy} onclick={() => (step = 'goal')}><Plus size={20} />Новая практика</button></li>
					<li><button disabled={busy} onclick={() => (step = 'category')}><Target size={20} />Новая цель</button></li>
					<li><button disabled={busy} onclick={() => close2('done')}><Check size={20} />Сделано</button></li>
				{/if}
				<li><button class="quiet" disabled={busy} onclick={() => close2('delete')}><Trash2 size={20} />Удалить</button></li>
			</ul>
		{:else if step === 'practice'}
			<p class="muted">Текст допишется в конец заметки «Всегда» пунктом чеклиста.</p>
			{@render practiceTree(toPractice, false)}
		{:else if step === 'day'}
			<div class="days" role="radiogroup" aria-label="День">
				{#each sort?.days ?? [today] as d (d)}
					<button role="radio" aria-checked={day === d} class:on={day === d} onclick={() => (day = d)}>{dayLabel(d)}</button>
				{/each}
			</div>
			{#if plannedList.length}
				<p class="cat">В плане этого дня</p>
				<ul class="list">
					{#each plannedList as p (p.id)}{@render practiceButton(p, toDay)}{/each}
				</ul>
				<p class="cat">Все практики</p>
			{:else}
				<p class="muted">На этот день ничего не запланировано: выбранная практика добавится в план.</p>
			{/if}
			{@render practiceTree(toDay, true)}
		{:else if step === 'goal'}
			<p class="muted">Название — первая строка записи, остальное — в заметку «Всегда».</p>
			<PracticeTree tree={goalTree} storageKey="inbox-goal-tree" mode="goal" onPickGoal={(g) => !busy && newPractice(g.id)} />
		{:else}
			<p class="muted">Название — первая строка записи, остальное — в «Направление — зачем».</p>
			<ul class="list">
				{#each sort?.categories ?? [] as c (c.id)}
					<li><button class="row" disabled={busy} onclick={() => newGoal(c.id)}><span class="dot" style="--c:{colorOf(c.color).light}"></span>{c.name}</button></li>
				{/each}
			</ul>
		{/if}
	</div>
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
		max-height: 90vh;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border-radius: 16px 16px 0 0;
		padding: 6px 16px calc(env(safe-area-inset-bottom) + 12px);
		box-shadow: 0 -10px 30px rgb(0 0 0 / 0.2);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 44px;
	}
	.title {
		font-weight: 700;
		font-size: 17px;
	}
	.back,
	.done {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		cursor: pointer;
	}
	.done {
		font-weight: 600;
	}
	.body {
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: 16px;
		resize: vertical;
	}
	.tf {
		position: relative;
	}
	.tf textarea {
		padding-right: 40px;
	}
	.expand {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.tf.full {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: calc(env(safe-area-inset-top) + 6px) 12px calc(env(safe-area-inset-bottom) + 10px);
		background: var(--surface);
	}
	.tf.full textarea {
		flex: 1;
		resize: none;
	}
	.full-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 44px;
		font-weight: 600;
	}
	.text {
		white-space: pre-wrap;
	}
	.actions,
	.list {
		list-style: none;
		margin: 8px 0;
		padding: 0;
	}
	.actions button,
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 48px;
		padding: 0 4px;
		border: none;
		border-bottom: 1px solid var(--line);
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		text-align: left;
		cursor: pointer;
	}
	.row {
		gap: 8px;
		min-height: 44px;
	}
	.row small {
		color: var(--muted);
		font-size: 12px;
	}
	.row em {
		margin-left: auto;
		font-style: normal;
		font-size: 12px;
		color: var(--muted);
	}
	.quiet {
		color: var(--muted) !important;
	}
	.dot {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--c);
	}
	.cat {
		margin: 12px 0 0;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		border-left: 3px solid var(--c, transparent);
		padding-left: 6px;
	}
	.days {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding: 4px 0 8px;
	}
	.days button {
		flex: none;
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.days button.on {
		background: var(--text);
		color: var(--bg);
		border-color: var(--text);
	}
	.muted {
		color: var(--muted);
		font-size: 14px;
	}
	.error {
		color: var(--text);
		background: var(--bg);
		border-radius: 8px;
		padding: 8px 10px;
		font-size: 14px;
	}
</style>
