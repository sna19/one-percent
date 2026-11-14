<script lang="ts">
	import Sun from '@lucide/svelte/icons/sun';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';

	/** Spec 007 A — main sections at the bottom, under the thumb; respects the iPhone home indicator. */
	export type Tab = 'today' | 'week' | 'all';
	interface Props {
		tab: Tab;
		onselect: (t: Tab) => void;
	}
	let { tab, onselect }: Props = $props();

	const tabs = [
		{ id: 'today', label: 'Сегодня', icon: Sun },
		{ id: 'week', label: 'Неделя', icon: CalendarDays },
		{ id: 'all', label: 'Всё', icon: LayoutGrid }
	] as const;
</script>

<nav class="tabbar" aria-label="Разделы">
	{#each tabs as t (t.id)}
		<button class:on={tab === t.id} aria-current={tab === t.id ? 'page' : undefined} onclick={() => onselect(t.id)}>
			<t.icon size={24} strokeWidth={tab === t.id ? 2.3 : 1.8} />
			<span>{t.label}</span>
		</button>
	{/each}
</nav>

<style>
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 5;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 4px 8px env(safe-area-inset-bottom);
		background: color-mix(in oklab, var(--surface) 88%, transparent);
		-webkit-backdrop-filter: blur(14px);
		backdrop-filter: blur(14px);
		border-top: 1px solid var(--line);
	}
	button {
		min-height: 50px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		border: none;
		background: none;
		color: var(--muted);
		font-size: 11px;
		cursor: pointer;
	}
	button.on {
		color: var(--text);
		font-weight: 600;
	}
</style>
