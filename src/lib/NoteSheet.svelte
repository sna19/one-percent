<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Highlight from '@tiptap/extension-highlight';
	import { TaskItem, TaskList } from '@tiptap/extension-list';
	import type { NoteDoc } from './note.js';
	import type { PracticeView } from './types.js';
	import { colorOf } from './palette.js';

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
		/** dose row; hidden for a practice marked by its checklist, and in the planner */
		showDose?: boolean;
		/** switch between the day note and the practice note */
		switchLabel?: string;
		onSwitch?: () => void;
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
		showDose = true,
		switchLabel,
		onSwitch,
		onDose,
		onNote,
		onClose
	}: Props = $props();

	let host: HTMLDivElement;
	let editor: Editor | undefined;
	let tick = $state(0); // re-read active marks after each change
	let exact = $state('');
	let dirty = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function save() {
		clearTimeout(timer);
		if (!editor || !dirty) return;
		dirty = false;
		onNote(editor.isEmpty ? null : (editor.getJSON() as NoteDoc));
	}

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
		editor = new Editor({
			element: host,
			extensions: [
				StarterKit.configure({
					heading: false,
					code: false,
					codeBlock: false,
					blockquote: false,
					horizontalRule: false,
					strike: false,
					orderedList: false,
					link: false
				}),
				Highlight,
				TaskList,
				TaskItem.configure({
					nested: true,
					a11y: {
						checkboxLabel: (node, checked) =>
							`${checked ? 'Сделано' : 'Не сделано'}: ${node.textContent || 'пункт'}`
					}
				})
			],
			content: doc ?? '',
			editorProps: { attributes: { 'aria-label': 'Заметка', class: 'note-editor' } },
			onUpdate: () => {
				dirty = true;
				clearTimeout(timer);
				timer = setTimeout(save, 700);
			},
			onTransaction: () => tick++
		});
		fit();
		window.visualViewport?.addEventListener('resize', fit);
		window.visualViewport?.addEventListener('scroll', fit);
	});

	onDestroy(() => {
		save();
		window.visualViewport?.removeEventListener('resize', fit);
		window.visualViewport?.removeEventListener('scroll', fit);
		editor?.destroy();
	});

	const tools = [
		{ name: 'bold', label: 'Жирный', icon: 'B', run: (e: Editor) => e.chain().focus().toggleBold().run() },
		{ name: 'italic', label: 'Курсив', icon: 'I', run: (e: Editor) => e.chain().focus().toggleItalic().run() },
		{ name: 'underline', label: 'Подчёркнутый', icon: 'U', run: (e: Editor) => e.chain().focus().toggleUnderline().run() },
		{ name: 'highlight', label: 'Выделение', icon: 'A', run: (e: Editor) => e.chain().focus().toggleHighlight().run() },
		{ name: 'bulletList', label: 'Список', icon: '•', run: (e: Editor) => e.chain().focus().toggleBulletList().run() },
		{ name: 'taskList', label: 'Чеклист', icon: '☑', run: (e: Editor) => e.chain().focus().toggleTaskList().run() }
	];
	const isActive = (name: string) => {
		void tick;
		return editor?.isActive(name) ?? false;
	};

	const c = $derived(colorOf(p.color));
	const done = $derived(amount !== undefined && amount >= p.minDose && amount > 0);
</script>

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
		<button class="done" onclick={close}>Готово</button>
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

	{#if noteTitle || onSwitch}
		<div class="note-head">
			<span>{noteTitle ?? 'Заметка'}</span>
			{#if onSwitch}<button class="switch" onclick={() => { save(); onSwitch?.(); }}>{switchLabel}</button>{/if}
		</div>
	{/if}

	<div class="toolbar" role="toolbar" aria-label="Форматирование">
		{#each tools as t (t.name)}
			<button
				class="tool tool-{t.name}"
				class:on={isActive(t.name)}
				aria-label={t.label}
				aria-pressed={isActive(t.name)}
				onpointerdown={(e) => e.preventDefault()}
				onclick={() => editor && t.run(editor)}>{t.icon}</button
			>
		{/each}
	</div>
	<div class="editor" bind:this={host}></div>
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
	.toolbar {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 4px;
		padding: 4px;
		border-radius: 10px;
		background: var(--bg);
	}
	.tool {
		min-height: 40px;
		border: none;
		border-radius: 8px;
		background: none;
		font-size: 17px;
	}
	.tool.on {
		background: var(--surface);
		box-shadow: inset 0 0 0 2px var(--c);
	}
	.tool-bold {
		font-weight: 800;
	}
	.tool-italic {
		font-style: italic;
		font-family: Georgia, serif;
	}
	.tool-underline {
		text-decoration: underline;
	}
	.tool-highlight {
		font-weight: 700;
		background: linear-gradient(transparent 55%, #f5d76e 55%) no-repeat center / 1.1em 100%;
	}
	.editor {
		flex: 1 1 auto;
		min-height: 120px;
		overflow-y: auto;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 2px 12px;
		-webkit-overflow-scrolling: touch;
	}
	/* the editor's own markup is created by Tiptap, so style it globally under .editor */
	.editor :global(.note-editor) {
		outline: none;
		min-height: 110px;
		font-size: 16px;
		line-height: 1.45;
	}
	.editor :global(.note-editor p) {
		margin: 8px 0;
	}
	.editor :global(.note-editor ul) {
		padding-left: 22px;
		margin: 6px 0;
	}
	.editor :global(.note-editor mark) {
		background: #f5d76e;
		color: #1d1d1f;
		border-radius: 3px;
		padding: 0 2px;
	}
	.editor :global(.note-editor ul[data-type='taskList']) {
		list-style: none;
		padding-left: 2px;
	}
	.editor :global(.note-editor ul[data-type='taskList'] > li) {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	.editor :global(.note-editor ul[data-type='taskList'] > li > label) {
		flex: none;
		margin-top: 9px;
	}
	.editor :global(.note-editor ul[data-type='taskList'] > li > label input) {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--c);
	}
	.editor :global(.note-editor ul[data-type='taskList'] > li > div) {
		flex: 1;
	}
	.editor :global(.note-editor ul[data-type='taskList'] > li[data-checked='true'] > div) {
		text-decoration: line-through;
		color: var(--muted);
	}
</style>
