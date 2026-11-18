<script lang="ts">
	import { onMount } from 'svelte';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { sortable } from './sortable.js';
	import DeedSheet from './DeedSheet.svelte';
	import type { StepView } from './steps.js';
	import { appNum } from './appSettings.svelte.js';
	import { dayTitle } from './today.js';

	/**
	 * #28 / #30 — a goal's deeds (steps) on its screen: open ones (box, ≡ to reorder, a tap edits), «+ Шаг» one line at a
	 * time, and the done ones in the goal's «Пройденный путь» with «Вернуть». A step is one box: no dose.
	 */
	interface Props {
		goalId: number;
		practices: { id: number; title: string }[];
	}
	let { goalId, practices }: Props = $props();

	let open = $state<StepView[]>([]);
	let done = $state<StepView[]>([]);
	let preview = $state<number[] | null>(null);
	let draft = $state('');
	let editing = $state<StepView | null>(null);
	let error = $state<string | null>(null);

	async function load() {
		const r = await fetch(`/api/steps?goalId=${goalId}`).catch(() => undefined);
		if (!r?.ok) return;
		const j = await r.json();
		open = j.open;
		done = j.done;
	}
	onMount(load);
	export const reload = load;

	async function post(body: Record<string, unknown>) {
		error = null;
		const r = await fetch('/api/steps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
		if (!r?.ok) {
			error = (await r?.json().catch(() => null))?.message ?? 'Нет связи с сервером';
			return null;
		}
		return r.json();
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const t = draft.trim();
		if (!t) return;
		draft = '';
		if (await post({ action: 'create', goalId, title: t })) await load();
	}
	async function check(s: StepView) {
		open = open.filter((x) => x.id !== s.id);
		if (await post({ action: 'done', id: s.id })) await load();
	}
	async function back(s: StepView) {
		if (await post({ action: 'undone', id: s.id })) await load();
	}
	async function saveEdit(fields: Record<string, unknown>) {
		if (!editing) return;
		await post({ action: 'update', id: editing.id, fields });
	}
	async function remove() {
		if (!editing || !confirm(`Убрать дело «${editing.title}»?`)) return;
		const id = editing.id;
		editing = null;
		if (await post({ action: 'delete', id })) await load();
	}
	async function closeEdit() {
		editing = null;
		await load();
	}

	const now = Date.now();
	const age = (s: StepView) => Math.floor((now - Date.parse(s.createdAt)) / 86_400_000);
	const pName = (id: number | null) => practices.find((p) => p.id === id)?.title;
	const list = $derived(preview ? preview.map((id) => open.find((s) => s.id === id)!).filter(Boolean) : open);
	const doneOn = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '');
</script>

<div class="steps">
	{#if list.length}
		<ul
			class="list"
			use:sortable={{
				preview: (ids) => (preview = ids),
				drop: async (ids) => {
					preview = ids;
					if (await post({ action: 'order', ids })) await load();
					preview = null;
				}
			}}
		>
			{#each list as s (s.id)}
				<li data-id={s.id}>
					<input type="checkbox" aria-label="Сделано: {s.title}" onchange={(e) => { e.currentTarget.checked = false; check(s); }} />
					<button class="title" onclick={() => (editing = { ...s })}>
						<span>{s.title}</span>
						{#if s.practiceId || s.plannedDate || s.dueDate || age(s) >= appNum('stale_days')}
							<small
								>{[pName(s.practiceId) ? `сначала · ${pName(s.practiceId)}` : '', s.plannedDate ? dayTitle(s.plannedDate) : '', s.dueDate ? `до ${dayTitle(s.dueDate).toLowerCase()}` : '']
									.filter(Boolean)
									.join(' · ')}{#if age(s) >= appNum('stale_days')}<span class="stale">{Math.floor(age(s) / 7)} нед</span>{/if}</small
							>
						{/if}
					</button>
					<button class="handle" data-handle aria-label="{s.title}: перетащить"><GripVertical size={18} /></button>
				</li>
			{/each}
		</ul>
	{/if}
	<form class="add" onsubmit={add}>
		<input bind:value={draft} placeholder="+ Дело" aria-label="Новое дело" enterkeyhint="next" />
	</form>
	{#if error}<p class="err" role="alert">{error}</p>{/if}

	{#if done.length}
		<details class="path">
			<summary>Пройденный путь · дела {done.length}</summary>
			<ul class="list">
				{#each done as s (s.id)}
					<li class="done">
						<span class="title"><span>{s.title}</span><small>{doneOn(s.doneAt)}</small></span>
						<button class="back" onclick={() => back(s)}>Вернуть</button>
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>

{#if editing}
	<DeedSheet step={editing} {practices} onSave={saveEdit} onRemove={remove} onClose={closeEdit} />
{/if}

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 46px;
		padding: 0 4px 0 12px;
	}
	.list li + li {
		border-top: 1px solid var(--line);
	}
	.list input[type='checkbox'] {
		flex: none;
		width: 20px;
		height: 20px;
		margin: 0;
	}
	.title {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		padding: 6px 0;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		text-align: left;
		cursor: pointer;
	}
	.title small {
		color: var(--muted);
		font-size: 12px;
	}
	.stale {
		margin-left: 6px;
		padding: 0 6px;
		border: 1px solid var(--line);
		border-radius: 999px;
	}
	.handle {
		flex: none;
		width: 40px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--muted);
		touch-action: none;
		cursor: grab;
	}
	.add {
		margin-top: 6px;
	}
	.add input {
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
		padding: 0 12px;
		border: 1px dashed var(--line);
		border-radius: 12px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
	}
	.err {
		font-size: 14px;
		color: var(--muted);
	}
	.path {
		margin-top: 10px;
	}
	.path summary {
		min-height: 36px;
		display: flex;
		align-items: center;
		color: var(--muted);
		font-size: 14px;
		cursor: pointer;
	}
	.done .title {
		color: var(--muted);
		cursor: default;
	}
	.back {
		flex: none;
		min-height: 34px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
</style>
