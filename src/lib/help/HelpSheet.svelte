<script lang="ts">
	import { onMount } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import HelpIcon from './HelpIcon.svelte';
	import { HELP } from './index.js';
	import type { Inline } from './md.js';

	/** Spec 011 — the help of one screen in a bottom sheet; «Словарь» and other topics open in the same sheet. */
	let { topic, onClose }: { topic: string; onClose: () => void } = $props();

	let stack = $state<string[]>([]);
	const current = $derived(stack.length ? stack[stack.length - 1] : topic);
	const doc = $derived(HELP[current]);
	let body: HTMLElement | undefined = $state();

	function open(t: string) {
		if (!HELP[t]) return;
		stack = [...stack, t];
		body?.scrollTo(0, 0);
	}

	onMount(() => {
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#snippet line(inl: Inline[])}
	{#each inl as x, i (i)}
		{#if x.t === 'text'}{x.text}{:else if x.t === 'bold'}<b>{x.text}</b>{:else if x.t === 'icon'}<HelpIcon name={x.name} />{:else}<button
				class="link"
				onclick={() => open(x.topic)}>{x.text}</button
			>{/if}
	{/each}
{/snippet}

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Справка: {doc?.title ?? ''}">
	<header>
		{#if stack.length}
			<button class="back" onclick={() => (stack = stack.slice(0, -1))} aria-label="Назад"><ChevronLeft size={20} />{HELP[stack[stack.length - 2] ?? topic]?.title}</button>
		{:else}
			<h2>{doc?.title ?? 'Справка'}</h2>
		{/if}
		<button class="done" onclick={onClose}>Готово</button>
	</header>
	<div class="body" bind:this={body}>
		{#if doc}
			{#if stack.length}<h2>{doc.title}</h2>{/if}
			{#each doc.blocks as b, i (i)}
				{#if b.t === 'p'}
					<p class:lead={i === 0}>{@render line(b.inl)}</p>
				{:else if b.t === 'h'}
					<h3>{b.text}</h3>
				{:else if b.t === 'ul'}
					<ul>
						{#each b.items as it, j (j)}<li>{@render line(it)}</li>{/each}
					</ul>
				{:else}
					<table>
						<thead><tr>{#each b.head as c, j (j)}<th>{@render line(c)}</th>{/each}</tr></thead>
						<tbody>
							{#each b.rows as r, j (j)}<tr>{#each r as c, k (k)}<td>{@render line(c)}</td>{/each}</tr>{/each}
						</tbody>
					</table>
				{/if}
			{/each}
			{#if current !== 'glossary'}
				<p class="foot"><button class="link" onclick={() => open('glossary')}>Словарь</button></p>
			{/if}
		{:else}
			<p>Справки для этого экрана пока нет.</p>
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
		max-height: 92vh;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		color: var(--text);
		border-radius: 16px 16px 0 0;
		padding: 8px 16px calc(env(safe-area-inset-bottom) + 12px);
		box-shadow: 0 -10px 30px rgb(0 0 0 / 0.2);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 40px;
	}
	.back,
	.done {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		cursor: pointer;
		padding: 0;
	}
	.done {
		font-weight: 600;
	}
	.body {
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		font-size: 14px;
		line-height: 1.35;
	}
	h2 {
		margin: 0 0 4px;
		font-size: 20px;
	}
	header h2 {
		margin: 0;
	}
	h3 {
		margin: 10px 0 2px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	p {
		margin: 4px 0;
	}
	.lead {
		color: var(--muted);
	}
	ul {
		margin: 0;
		padding-left: 18px;
	}
	li {
		margin: 2px 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	th,
	td {
		text-align: left;
		vertical-align: top;
		padding: 5px 6px 5px 0;
		border-bottom: 1px solid var(--line);
	}
	th {
		color: var(--muted);
		font-weight: 600;
	}
	td:first-child {
		font-weight: 600;
		width: 38%;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		color: var(--link, var(--text));
		text-decoration: underline;
		cursor: pointer;
	}
	.foot {
		margin-top: 12px;
		min-height: 32px;
	}
</style>
