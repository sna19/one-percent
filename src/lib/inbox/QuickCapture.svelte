<script lang="ts">
	import { onMount } from 'svelte';
	import { inbox } from './state.svelte.js';

	/**
	 * Spec 008 — quick capture: one field, keyboard at once, nothing to choose. The sheet is always in the
	 * page and `show()` focuses the field in the same tap, so iOS raises the keyboard. «Готово», ⌘/Ctrl+Enter,
	 * a tap outside or a swipe down all save: a written thought is never lost by accident.
	 */
	let root: HTMLDivElement;
	let field: HTMLTextAreaElement;
	let text = $state('');
	let shown = $state(false);
	let dragY = $state(0);
	let startY: number | null = null;
	/** keeps the bottom sheet above the iPhone keyboard (the same way as the note editor) */
	let offset = $state(0);
	onMount(() => {
		const v = window.visualViewport;
		if (!v) return;
		const fit = () => (offset = Math.max(0, window.innerHeight - v.height - v.offsetTop));
		v.addEventListener('resize', fit);
		v.addEventListener('scroll', fit);
		return () => {
			v.removeEventListener('resize', fit);
			v.removeEventListener('scroll', fit);
		};
	});

	export function show() {
		root.style.display = 'block';
		shown = true;
		field.focus();
	}

	async function finish() {
		const t = field.value;
		field.blur();
		root.style.display = 'none';
		shown = false;
		dragY = 0;
		text = '';
		if (t.trim()) await inbox.add(t);
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			finish();
		} else if (e.key === 'Escape') finish();
	}

	function down(e: PointerEvent) {
		startY = e.clientY;
	}
	function move(e: PointerEvent) {
		if (startY !== null) dragY = Math.max(0, e.clientY - startY);
	}
	function up() {
		if (startY === null) return;
		startY = null;
		if (dragY > 60) finish();
		else dragY = 0;
	}
</script>

<div class="qc" bind:this={root} style="display:none">
	<div class="backdrop" role="presentation" onclick={finish}></div>
	<div class="sheet" role="dialog" aria-label="Запись во входящие" aria-hidden={!shown} style="bottom:{offset}px;transform: translateY({dragY}px)">
		<div class="grab" role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
			<span class="handle"></span>
			<div class="head">
				<span>Во входящие</span>
				<button class="done" onclick={finish}>Готово</button>
			</div>
		</div>
		<textarea bind:this={field} bind:value={text} onkeydown={keydown} rows="4" placeholder="Мысль, шаг, идея…" aria-label="Текст записи"></textarea>
	</div>
</div>

{#if inbox.toast}<p class="toast" role="status">{inbox.toast}</p>{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgb(0 0 0 / 0.3);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 31;
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px calc(env(safe-area-inset-bottom) + 12px);
		background: var(--surface);
		border-radius: 16px 16px 0 0;
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.25);
		touch-action: none;
	}
	.grab {
		padding-top: 6px;
	}
	.handle {
		display: block;
		width: 36px;
		height: 4px;
		margin: 0 auto 2px;
		border-radius: 2px;
		background: var(--line);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 44px;
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
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: 110px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: 17px;
		resize: none;
		touch-action: auto;
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(env(safe-area-inset-bottom) + 76px);
		transform: translateX(-50%);
		z-index: 40;
		margin: 0;
		padding: 8px 16px;
		border-radius: 999px;
		background: var(--text);
		color: var(--bg);
		font-size: 14px;
		pointer-events: none;
	}
</style>
