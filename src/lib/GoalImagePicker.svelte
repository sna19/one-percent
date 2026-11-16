<script lang="ts">
	import GoalImage from './GoalImage.svelte';
	import { GOAL_ICON_GROUPS, GOAL_ICONS } from './goalIcons.js';

	/** Spec 013 A — choosing a goal's picture: an icon of the app's set, one emoji, or 1–3 characters. */
	interface Props {
		kind: 'icon' | 'emoji' | 'text';
		value: string;
		color: string;
		title: string;
		onPick: (kind: 'icon' | 'emoji' | 'text', value: string) => void;
		onClose: () => void;
	}
	let { kind, value, color, title, onPick, onClose }: Props = $props();

	// svelte-ignore state_referenced_locally
	let tab = $state<'icon' | 'emoji' | 'text'>(kind);
	// svelte-ignore state_referenced_locally
	let emoji = $state(kind === 'emoji' ? value : '');
	// svelte-ignore state_referenced_locally
	let letters = $state(kind === 'text' ? value : title.trim().slice(0, 2));

	/** the first grapheme of what was typed — an emoji may be several code points */
	function firstGrapheme(s: string): string {
		const seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
		if (seg) for (const g of new seg(undefined, { granularity: 'grapheme' }).segment(s.trim())) return g.segment;
		return [...s.trim()].slice(0, 2).join('');
	}
	const TABS = [
		['icon', 'Иконки'],
		['emoji', 'Эмодзи'],
		['text', 'Текст']
	] as const;
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="sheet" role="dialog" aria-label="Образ цели">
	<header>
		<span class="title">Образ цели</span>
		<button class="done" onclick={onClose}>Готово</button>
	</header>
	<div class="seg" role="tablist">
		{#each TABS as [k, t] (k)}
			<button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => (tab = k)}>{t}</button>
		{/each}
	</div>

	<div class="body">
		{#if tab === 'icon'}
			{#each GOAL_ICON_GROUPS as g (g.name)}
				<p class="group">{g.name}</p>
				<div class="icons">
					{#each g.icons as n (n)}
						{@const I = GOAL_ICONS[n]}
						<button class="ic" class:on={kind === 'icon' && value === n} aria-label={n} onclick={() => onPick('icon', n)}><I size={24} /></button>
					{/each}
				</div>
			{/each}
		{:else if tab === 'emoji'}
			<p class="hint">Одно эмодзи с клавиатуры iPhone (🌐 или 😀 на клавиатуре).</p>
			<div class="row">
				<input class="big" bind:value={emoji} inputmode="text" aria-label="Эмодзи" placeholder="🎹" />
				<GoalImage kind="emoji" value={firstGrapheme(emoji)} {color} {title} size={52} />
			</div>
			<button class="primary" disabled={!emoji.trim()} onclick={() => onPick('emoji', firstGrapheme(emoji))}>Выбрать</button>
		{:else}
			<p class="hint">1–3 символа, например «IT» или «עב».</p>
			<div class="row">
				<input class="big" bind:value={letters} maxlength="3" aria-label="Текст образа" />
				<GoalImage kind="text" value={letters} {color} {title} size={52} />
			</div>
			<button class="primary" disabled={[...letters.trim()].length > 3} onclick={() => onPick('text', letters.trim())}>Выбрать</button>
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
		max-height: 80vh;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px 16px calc(env(safe-area-inset-bottom) + 12px);
		background: var(--surface);
		border-radius: 16px 16px 0 0;
		box-shadow: 0 -10px 30px rgb(0 0 0 / 0.2);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.title {
		font-weight: 700;
		font-size: 17px;
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
	.body {
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.group {
		margin: 6px 0 0;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.icons {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
		gap: 4px;
	}
	.ic {
		height: 48px;
		border: none;
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
	}
	.ic.on {
		background: var(--text);
		color: var(--bg);
	}
	.hint {
		margin: 0;
		font-size: 14px;
		color: var(--muted);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.big {
		flex: 1;
		min-width: 0;
		min-height: 52px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: 24px;
	}
	.primary {
		min-height: 44px;
		border: none;
		border-radius: 10px;
		background: var(--text);
		color: var(--bg);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.4;
	}
</style>
