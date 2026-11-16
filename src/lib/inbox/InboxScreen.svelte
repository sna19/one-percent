<script lang="ts">
	import { ageDays, docToPlain, STALE_DAYS, type InboxItemView } from '../inbox.js';
	import type { PracticeView } from '../types.js';
	import type { DateStr } from '../dates.js';
	import ItemSheet from './ItemSheet.svelte';
	import { inbox } from './state.svelte.js';

	/**
	 * Spec 008 — «Входящие»: a field on top to write, the items newest first, a tap opens one for sorting,
	 * a swipe left removes, right marks done. Nothing is done from here — only sorted.
	 */
	interface Props {
		practices: PracticeView[];
		today: DateStr;
		onChanged: () => void;
		/** Spec 010: the Sunday flow inbox → review → plan; shown while last week's review waits */
		reviewNext?: boolean;
	}
	let { practices, today, onChanged, reviewNext = false }: Props = $props();

	let draft = $state('');
	let openItem = $state<InboxItemView | null>(null);
	let showHistory = $state(false);
	const now = $derived(new Date(`${today}T23:59:59`));

	async function save() {
		const t = draft;
		draft = '';
		await inbox.add(t);
	}
	function keydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			save();
		}
	}

	const fmtTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
	const fmtDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
	function when(iso: string): string {
		const d = new Date(iso);
		const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
		if (days <= 0) return `сегодня, ${fmtTime.format(d)}`;
		if (days === 1) return `вчера, ${fmtTime.format(d)}`;
		return fmtDay.format(d);
	}
	/** The first paragraph whole (the rest is seen when the item is opened). */
	const firstPara = (i: InboxItemView) => docToPlain(i.text).split('\n').find((l) => l.trim()) ?? '';
	const more = (i: InboxItemView) => docToPlain(i.text).split('\n').filter((l) => l.trim()).length > 1;

	// swipe: left → «Удалить», right → «Сделано»
	let swipe = $state<{ key: string; x0: number; y0: number; dx: number; locked: boolean } | null>(null);
	let swiped = false;
	function down(e: PointerEvent, i: InboxItemView) {
		swipe = { key: i.clientId, x0: e.clientX, y0: e.clientY, dx: 0, locked: false };
		swiped = false;
	}
	function move(e: PointerEvent) {
		if (!swipe) return;
		const dx = e.clientX - swipe.x0;
		const dy = e.clientY - swipe.y0;
		if (!swipe.locked) {
			if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return (swipe = null);
			if (Math.abs(dx) > 10) {
				swipe.locked = true;
				(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			}
		}
		if (swipe.locked) swipe.dx = dx;
	}
	function up(i: InboxItemView) {
		if (!swipe) return;
		const dx = swipe.dx;
		swiped = swipe.locked;
		swipe = null;
		if (dx < -90) inbox.close(i, 'delete');
		else if (dx > 90) inbox.close(i, 'done');
	}
	function tap(i: InboxItemView) {
		if (swiped) return;
		openItem = i;
	}

	const STATUS: Record<string, string> = { done: 'Сделано', deleted: 'Удалено', processed: 'Разобрано' };
	async function restore(i: InboxItemView) {
		try {
			await inbox.act({ action: 'restore', id: i.id });
			inbox.say('Снова во входящих');
		} catch (e) {
			inbox.error = (e as Error).message;
		}
		await inbox.load();
	}
</script>

<div class="write">
	<textarea bind:value={draft} onkeydown={keydown} rows="2" placeholder="Записать мысль…" aria-label="Новая запись"></textarea>
	{#if draft.trim()}<button class="save" onclick={save}>Готово</button>{/if}
</div>

{#if inbox.error}<p class="error" role="alert">{inbox.error}</p>{/if}

{#if inbox.open.length}
	<ul class="items">
		{#each inbox.open as i (i.clientId)}
			{@const dx = swipe?.key === i.clientId ? swipe.dx : 0}
			{@const age = ageDays(i.createdAt, now)}
			<li class="slot">
				<span class="under left" class:shown={dx > 0}>Сделано</span>
				<span class="under right" class:shown={dx < 0}>Удалить</span>
				<button
					class="item"
					style="transform: translateX({dx}px)"
					onpointerdown={(e) => down(e, i)}
					onpointermove={move}
					onpointerup={() => up(i)}
					onpointercancel={() => (swipe = null)}
					onclick={() => tap(i)}
				>
					<span class="t">{firstPara(i)}{#if more(i)}<span class="more"> …</span>{/if}</span>
					<span class="meta">
						{when(i.createdAt)}
						{#if i.pending}· не отправлено{/if}
						{#if age >= STALE_DAYS}<span class="stale">{Math.floor(age / 7)} нед</span>{/if}
					</span>
				</button>
			</li>
		{/each}
	</ul>
	<p class="hint">Тап — разобрать. Свайп вправо — сделано, влево — удалить.</p>
{:else}
	<p class="empty">Входящие пусты. Запиши мысль — разберёшь потом.</p>
{/if}

{#if inbox.history.length}
	<button class="hist-toggle" aria-expanded={showHistory} onclick={() => (showHistory = !showHistory)}>
		История · {inbox.history.length}
	</button>
	{#if showHistory}
		<ul class="items history">
			{#each inbox.history as i (i.clientId)}
				<li class="hrow">
					<span class="t">{firstPara(i)}<span class="meta">{i.target ?? STATUS[i.status]} · {when(i.closedAt ?? i.createdAt)}</span></span>
					<button class="restore" onclick={() => restore(i)}>Вернуть</button>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

{#if reviewNext}
	<a class="next" href="/review?from=week">Дальше — итоги недели →</a>
{/if}

{#if openItem}
	<ItemSheet item={openItem} {practices} {today} onClose={() => (openItem = null)} {onChanged} />
{/if}

<style>
	.write {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		margin: 4px 0 12px;
	}
	.write textarea {
		flex: 1;
		box-sizing: border-box;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 16px;
		resize: none;
	}
	.save {
		min-height: 44px;
		padding: 0 14px;
		border: none;
		border-radius: 12px;
		background: var(--text);
		color: var(--bg);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.slot {
		position: relative;
		margin-bottom: 6px;
		border-radius: 12px;
		overflow: hidden;
	}
	.under {
		position: absolute;
		top: 0;
		bottom: 0;
		display: none;
		align-items: center;
		padding: 0 16px;
		font-size: 14px;
		color: var(--muted);
	}
	.under.shown {
		display: flex;
	}
	.under.left {
		left: 0;
	}
	.under.right {
		right: 0;
	}
	.item {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: 10px 12px;
		border: none;
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		touch-action: pan-y;
	}
	.t {
		font-size: 16px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.more {
		color: var(--muted);
	}
	.meta {
		display: block;
		color: var(--muted);
		font-size: 12px;
	}
	.stale {
		margin-left: 6px;
		padding: 0 6px;
		border: 1px solid var(--line);
		border-radius: 999px;
	}
	.hint,
	.empty {
		color: var(--muted);
		font-size: 13px;
		text-align: center;
	}
	.empty {
		margin: 32px 0;
		font-size: 15px;
	}
	.hist-toggle {
		display: block;
		width: 100%;
		min-height: 44px;
		margin-top: 12px;
		border: none;
		border-top: 1px solid var(--line);
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		text-align: left;
		cursor: pointer;
	}
	.hrow {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
	}
	.hrow .t {
		flex: 1;
		font-size: 14px;
		color: var(--muted);
	}
	.restore {
		min-height: 36px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.next {
		display: block;
		margin: 16px 0 0;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		text-align: center;
	}
	.error {
		background: var(--surface);
		border-radius: 8px;
		padding: 8px 10px;
		font-size: 14px;
	}
</style>
