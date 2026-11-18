<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import HelpSheet from './help/HelpSheet.svelte';
	import RichEditor from './RichEditor.svelte';
	import type { StepView } from './steps.js';

	/**
	 * #30 — a deed's sheet, the same on «Сегодня» and on the goal's screen: what to do, «сначала» of a practice,
	 * when and by when, the description with its subtasks. Every field saves itself; «Готово» closes.
	 */
	interface Props {
		step: StepView;
		/** the practices of the deed's goal, for «сначала» */
		practices: { id: number; title: string }[];
		onSave: (fields: Record<string, unknown>) => void | Promise<unknown>;
		onRemove: () => void;
		onClose: () => void;
		/** «Сделано» — shown where the deed is ticked off (on «Сегодня») */
		onDone?: () => void;
	}
	let { step, practices, onSave, onRemove, onClose, onDone }: Props = $props();

	let rich: RichEditor | undefined;
	function close() {
		rich?.flush();
		onClose();
	}

	// Keep the sheet above the iPhone keyboard, as the practice sheet does.
	let vh = $state<number | undefined>();
	let offset = $state(0);
	function fit() {
		const v = window.visualViewport;
		if (!v) return;
		vh = v.height;
		offset = Math.max(0, window.innerHeight - v.height - v.offsetTop);
	}
	onMount(() => {
		fit();
		window.visualViewport?.addEventListener('resize', fit);
		window.visualViewport?.addEventListener('scroll', fit);
	});
	onDestroy(() => {
		window.visualViewport?.removeEventListener('resize', fit);
		window.visualViewport?.removeEventListener('scroll', fit);
	});
	let helpOpen = $state(false);
</script>

{#if helpOpen}<HelpSheet topic="deed" onClose={() => (helpOpen = false)} />{/if}
<div class="backdrop" role="presentation" onclick={close}></div>
<div class="sheet" role="dialog" aria-label="Дело: {step.title}" style="bottom:{offset}px;{vh ? `max-height:${Math.round(vh * 0.92)}px` : ''}">
	<header>
		<div>
			<p class="title">{step.title}</p>
			<p class="sub">Дело · {step.goalTitle}</p>
		</div>
		<span class="head-btns">
			<button class="help" aria-label="Справка" title="Справка" onclick={() => (helpOpen = true)}><CircleHelp size={20} /></button>
			<button class="donebtn" onclick={close}>Готово</button>
		</span>
	</header>
	<div class="body">
		{#if onDone}<button class="tick" onclick={() => { rich?.flush(); onDone?.(); }}>Сделано</button>{/if}
		<label>Что сделать <input value={step.title} onchange={(ev) => onSave({ title: ev.currentTarget.value })} /></label>
		<label
			>Часть практики — «сначала»
			<select value={step.practiceId ?? ''} onchange={(ev) => onSave({ practiceId: ev.currentTarget.value ? Number(ev.currentTarget.value) : null })}>
				<option value="">— дело само по себе —</option>
				{#each practices as p (p.id)}<option value={p.id}>{p.title}</option>{/each}
			</select>
		</label>
		<div class="dates">
			<label>Когда делаю <input type="date" value={step.plannedDate ?? ''} onchange={(ev) => onSave({ plannedDate: ev.currentTarget.value || null })} /></label>
			<label>Срок — до <input type="date" value={step.dueDate ?? ''} onchange={(ev) => onSave({ dueDate: ev.currentTarget.value || null })} /></label>
		</div>
		<div class="field">
			<span>Описание и подзадачи</span>
			<RichEditor bind:this={rich} grow label="Описание дела" doc={step.note} onChange={(d) => onSave({ note: d })} />
		</div>
		<label class="toggle"
			><input type="checkbox" checked={!!step.showNoteFull} onchange={(ev) => onSave({ showNoteFull: ev.currentTarget.checked })} /> Показывать описание целиком на «Сегодня»</label
		>
		<button class="remove" onclick={onRemove}>Убрать дело</button>
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
		max-height: 92vh;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		box-sizing: border-box;
		padding: 14px 16px calc(env(safe-area-inset-bottom) + 12px);
		background: var(--surface);
		border-radius: 16px 16px 0 0;
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
	}
	.donebtn {
		min-height: 40px;
		padding: 0 14px;
		border-radius: 10px;
		border: none;
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-y: auto;
	}
	.tick {
		min-height: 44px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		font-weight: 600;
	}
	.dates {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	label,
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		font-size: 13px;
		color: var(--muted);
	}
	input,
	select {
		min-height: 44px;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: 16px;
	}
	label.toggle {
		flex-direction: row;
		align-items: center;
		gap: 10px;
		font-size: 15px;
		color: var(--text);
	}
	label.toggle input {
		min-height: 0;
		width: 22px;
		height: 22px;
		margin: 0;
	}
	.remove {
		align-self: flex-start;
		min-height: 40px;
		border: none;
		background: none;
		color: var(--muted);
	}
</style>
