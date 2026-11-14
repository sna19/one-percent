<script lang="ts">
	import { safeHref, type NoteDoc, type NoteNode } from './note.js';

	/**
	 * Spec 006 — a day note shown on the Today card: read-only, formatting kept, built from the
	 * note's JSON (never from HTML). Checklist boxes tick with one tap; a tap on the text opens the editor.
	 */
	interface Props {
		doc: NoteDoc;
		onToggle: (index: number) => void;
		onOpen: () => void;
		/** boxes cannot be ticked (a day that has not come yet) */
		readonly?: boolean;
	}
	let { doc, onToggle, onOpen, readonly = false }: Props = $props();

	// document-order index of each checklist item, for onToggle
	const taskIndex = $derived.by(() => {
		const map = new Map<NoteNode, number>();
		let i = 0;
		const walk = (n: NoteNode) => {
			if (n.type === 'taskItem') map.set(n, i++);
			n.content?.forEach(walk);
		};
		walk(doc);
		return map;
	});

	const has = (n: NoteNode, mark: string) => n.marks?.some((m) => m.type === mark) ?? false;
	const hrefOf = (n: NoteNode) => safeHref(n.marks?.find((m) => m.type === 'link')?.attrs?.href);
</script>

<!-- the text area opens the editor; boxes stop the tap from reaching it -->
<div class="note-view" role="button" tabindex="0" onclick={onOpen} onkeydown={(e) => e.key === 'Enter' && onOpen()}>
	{#each doc.content ?? [] as n, i (i)}
		{@render block(n)}
	{/each}
</div>

{#snippet block(n: NoteNode)}
	{#if n.type === 'paragraph'}
		<p>{@render inline(n.content)}</p>
	{:else if n.type === 'bulletList'}
		<ul>
			{#each n.content ?? [] as li, i (i)}
				<li>{#each li.content ?? [] as c, j (j)}{@render block(c)}{/each}</li>
			{/each}
		</ul>
	{:else if n.type === 'taskList'}
		<ul class="tasks">
			{#each n.content ?? [] as li, i (i)}
				{@const done = !!li.attrs?.checked}
				<li class:done>
					<button
						class="tick"
						class:on={done}
						role="checkbox"
						aria-checked={done}
						disabled={readonly}
						aria-label="{done ? 'Сделано' : 'Не сделано'}: {(li.content ?? [])
							.map((c) => (c.content ?? []).map((t) => t.text ?? '').join(''))
							.join(' ')}"
						onclick={(e) => {
							e.stopPropagation();
							onToggle(taskIndex.get(li) ?? -1);
						}}
					>{#if done}<svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6 9.6 3.4" /></svg>{/if}</button>
					<div>{#each li.content ?? [] as c, j (j)}{@render block(c)}{/each}</div>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet inline(nodes: NoteNode[] | undefined)}
	{#each nodes ?? [] as t, i (i)}
		{#if t.type === 'hardBreak'}<br />{:else if t.type === 'text'}{@render styled(t)}{/if}
	{/each}
{/snippet}

{#snippet styled(t: NoteNode)}
	{@const href = hrefOf(t)}
	{#if href}<a {href} target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>{@render marked(t)}</a
		>{:else}{@render marked(t)}{/if}
{/snippet}
{#snippet marked(t: NoteNode)}
	{#if has(t, 'highlight')}<mark>{@render bold(t)}</mark>{:else}{@render bold(t)}{/if}
{/snippet}
{#snippet bold(t: NoteNode)}
	{#if has(t, 'bold')}<strong>{@render italic(t)}</strong>{:else}{@render italic(t)}{/if}
{/snippet}
{#snippet italic(t: NoteNode)}
	{#if has(t, 'italic')}<em>{@render under(t)}</em>{:else}{@render under(t)}{/if}
{/snippet}
{#snippet under(t: NoteNode)}
	{#if has(t, 'underline')}<u>{t.text}</u>{:else}{t.text}{/if}
{/snippet}

<style>
	.note-view {
		font-size: 14px;
		line-height: 1.4;
		cursor: pointer;
		outline: none;
	}
	.note-view p {
		margin: 3px 0;
		min-height: 1em;
	}
	ul {
		margin: 3px 0;
		padding-left: 18px;
	}
	ul.tasks {
		list-style: none;
		padding-left: 0;
	}
	.tasks li {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}
	.tasks li > div {
		flex: 1;
		min-width: 0;
	}
	.tasks li.done > div {
		text-decoration: line-through;
		opacity: 0.7;
	}
	.tick {
		flex: none;
		width: 22px;
		height: 22px;
		margin-top: 1px;
		padding: 0;
		border-radius: 6px;
		border: 2px solid currentColor;
		background: none;
		color: inherit;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		/* a bigger touch target than the box itself */
		position: relative;
	}
	.tick::before {
		content: '';
		position: absolute;
		inset: -10px;
	}
	.tick:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.tick svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	a {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 2px;
		word-break: break-word;
	}
	mark {
		background: #f5d76e;
		color: #1d1d1f;
		border-radius: 3px;
		padding: 0 2px;
	}
</style>
