<script lang="ts">
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import HelpSheet from './help/HelpSheet.svelte';
	import { onDestroy, onMount } from 'svelte';
	import type { NoteDoc } from './note.js';
	import RichEditor from './RichEditor.svelte';
	import type { PracticeView } from './types.js';
	import { colorOf } from './palette.js';
	import NoteHead from './NoteHead.svelte';

	/**
	 * Spec 005 — the practice sheet: dose for the day on top, the standing note below.
	 * The note saves itself (shortly after typing and on close); choosing a dose keeps the sheet open.
	 */
	interface Props {
		p: PracticeView;
		dateLabel: string;
		amount: number | undefined;
		/** what the editor edits: the practice's standing note, or a day note (Spec 006) */
		doc: NoteDoc | null;
		/** shown above the editor, e.g. «План дня» */
		noteTitle?: string;
		/** task 13: the note's heading with its icon («Всегда» / «Ср, 18 ноября»), as on the card */
		head?: { kind: 'practice' | 'day'; label?: string; day?: number };
		/** dose row; hidden for a practice marked by its checklist, and in the planner */
		showDose?: boolean;
		/** switch between the day note and the practice note */
		switchLabel?: string;
		onSwitch?: () => void;
		/** one more note action, e.g. copy the day note to the whole week */
		extraLabel?: string;
		onExtra?: () => void;
		onDose: (amount: number) => void;
		onNote: (doc: NoteDoc | null) => void;
		onClose: () => void;
	}
	let {
		p,
		dateLabel,
		amount,
		doc,
		noteTitle,
		head,
		showDose = true,
		switchLabel,
		onSwitch,
		extraLabel,
		onExtra,
		onDose,
		onNote,
		onClose
	}: Props = $props();

	let rich: RichEditor | undefined;
	let exact = $state('');
	const save = () => rich?.flush();

	function close() {
		save();
		onClose();
	}

	// Keep the sheet (and the toolbar) above the iPhone keyboard.
	let vh = $state<number | undefined>();
	let offset = $state(0);
	function fit() {
		const v = window.visualViewport;
		if (!v) return;
		vh = v.height;
		offset = Math.max(0, window.innerHeight - v.height - v.offsetTop);
	}

	onMount(() => {
		exact = String(amount ?? p.normDose);
		fit();
		window.visualViewport?.addEventListener('resize', fit);
		window.visualViewport?.addEventListener('scroll', fit);
	});

	onDestroy(() => {
		window.visualViewport?.removeEventListener('resize', fit);
		window.visualViewport?.removeEventListener('scroll', fit);
	});

	let helpOpen = $state(false);
	const c = $derived(colorOf(p.color));
	const done = $derived(amount !== undefined && amount >= p.minDose && amount > 0);
</script>

{#if helpOpen}<HelpSheet topic="note" onClose={() => (helpOpen = false)} />{/if}
<div class="backdrop" role="presentation" onclick={close}></div>
<div
	class="sheet"
	role="dialog"
	aria-label="{p.title}: доза и заметка"
	style="--c-light:{c.light};--c-dark:{c.dark};bottom:{offset}px;{vh ? `max-height:${Math.round(vh * 0.92)}px` : ''}"
>
	<header>
		<div>
			<p class="title">{p.title}</p>
			<p class="sub">{p.goalTitle !== p.title ? `${p.goalTitle} · ` : ''}{dateLabel}</p>
		</div>
		<span class="head-btns">
			<button class="help" aria-label="Справка" title="Справка" onclick={() => (helpOpen = true)}><CircleHelp size={20} /></button>
			<button class="done" onclick={close}>Готово</button>
		</span>
	</header>

	{#if showDose}
	<div class="dose">
		<button class:on={amount === p.minDose && p.minDose !== p.normDose} onclick={() => onDose(p.minDose)}>Мин · {p.minDose}</button>
		<button class:on={amount === p.normDose} onclick={() => onDose(p.normDose)}>Норма · {p.normDose}</button>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				const v = Number(exact.replace(',', '.'));
				if (Number.isFinite(v) && v >= 0) onDose(v);
			}}
		>
			<input type="text" inputmode="decimal" bind:value={exact} aria-label="Количество, {p.unit}" />
			<button type="submit" aria-label="Записать количество">✓</button>
		</form>
		<button class="quiet" disabled={!amount} onclick={() => onDose(0)}>Очистить</button>
	</div>
	<p class="state">{done ? `Отмечено: ${amount} ${p.unit}` : amount ? `${amount} из ${p.normDose} ${p.unit}` : `Не отмечено · ${p.unit}`}</p>
	{/if}

	{#if head || noteTitle || onSwitch || onExtra}
		<div class="note-head">
			{#if head}<span class="head-icon"><NoteHead {...head} /></span>{:else}<span>{noteTitle ?? 'Заметка'}</span>{/if}
			{#if onSwitch}<button class="switch" onclick={() => { save(); onSwitch?.(); }}>{switchLabel}</button>{/if}
			{#if onExtra}<button class="switch" onclick={() => { save(); onExtra?.(); }}>{extraLabel}</button>{/if}
		</div>
	{/if}

	<RichEditor bind:this={rich} {doc} onChange={(d) => onNote(d)} />
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.35);
		z-index: 10;
	}
	.sheet {
		--c: var(--c-light);
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 11;
		max-width: 560px;
		max-height: 92vh;
		margin: 0 auto;
		background: var(--surface);
		border-radius: 16px 16px 0 0;
		padding: 14px 16px calc(env(safe-area-inset-bottom) + 12px);
		display: flex;
		flex-direction: column;
		gap: 10px;
		box-sizing: border-box;
	}
	@media (prefers-color-scheme: dark) {
		.sheet {
			--c: var(--c-dark);
		}
	}
	.head-btns {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.help {
		width: 36px;
		height: 36px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.title {
		margin: 0;
		font-weight: 700;
		font-size: 17px;
	}
	.sub {
		margin: 2px 0 0;
		color: var(--muted);
		font-size: 13px;
	}
	button {
		cursor: pointer;
		font: inherit;
		color: var(--text);
	}
	.done {
		min-height: 40px;
		padding: 0 14px;
		border-radius: 10px;
		border: none;
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}
	.dose {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.dose > button {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0 8px;
	}
	.dose form {
		min-width: 0;
	}
	.dose button,
	.dose input {
		min-height: 44px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--bg);
		font-size: 15px;
	}
	.dose button.on {
		border: 2px solid var(--c);
		font-weight: 600;
	}
	.dose form {
		display: flex;
		gap: 6px;
	}
	.dose input {
		flex: 1;
		min-width: 0;
		padding: 0 10px;
		font-size: 17px;
		color: var(--text);
	}
	.dose form button {
		width: 44px;
	}
	.dose .quiet {
		background: none;
		color: var(--muted);
	}
	.state {
		margin: -2px 0 0;
		font-size: 13px;
		color: var(--muted);
	}
	.note-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.head-icon {
		text-transform: none;
		color: var(--text);
		font-size: 14px;
	}
	.switch {
		border: none;
		background: none;
		padding: 6px 0;
		font-size: 13px;
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
