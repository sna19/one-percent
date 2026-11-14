<script lang="ts" module>
	import type { Component, Snippet } from 'svelte';

	export interface MenuItem {
		label: string;
		icon?: Component;
		href?: string;
		onclick?: () => void;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';

	/**
	 * Spec 007 A — one top bar for every screen: «‹ previous screen» on nested screens, a large title
	 * that shrinks into a compact centred one on scroll, up to two icon actions and a «⋯» menu.
	 */
	interface Props {
		title: string;
		/** small line under the large title */
		subtitle?: string;
		back?: { label: string; href: string };
		/** up to two icon buttons (use IconButton) */
		actions?: Snippet;
		menu?: MenuItem[];
		/** extra row under the title (e.g. day or week arrows) */
		below?: Snippet;
	}
	let { title, subtitle, back, actions, menu = [], below }: Props = $props();

	let compact = $state(false);
	let menuOpen = $state(false);

	onMount(() => {
		const onScroll = () => (compact = window.scrollY > 36);
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<div class="bar" class:compact>
	<div class="row">
		<div class="left">
			{#if back}
				<a class="back" href={back.href} aria-label="Назад: {back.label}"><ChevronLeft size={22} />{back.label}</a>
			{/if}
		</div>
		<div class="center" aria-hidden={!compact}>{title}</div>
		<div class="right">
			{@render actions?.()}
			{#if menu.length}
				<button class="icon" aria-label="Ещё действия" title="Ещё" aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
					<Ellipsis size={22} />
				</button>
			{/if}
		</div>
	</div>
	{#if menuOpen}
		<div class="scrim" role="presentation" onclick={() => (menuOpen = false)}></div>
		<ul class="menu" role="menu">
			{#each menu as m (m.label)}
				<li role="none">
					{#if m.href}
						<a role="menuitem" href={m.href} onclick={() => (menuOpen = false)}>
							{#if m.icon}<m.icon size={18} />{/if}{m.label}
						</a>
					{:else}
						<button
							role="menuitem"
							onclick={() => {
								menuOpen = false;
								m.onclick?.();
							}}>{#if m.icon}<m.icon size={18} />{/if}{m.label}</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
<div class="large">
	<h1>{title}</h1>
	{#if subtitle}<p>{subtitle}</p>{/if}
</div>
{@render below?.()}

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 5;
		margin: 0 -12px;
		padding: env(safe-area-inset-top) 4px 0;
		background: color-mix(in oklab, var(--bg) 82%, transparent);
		-webkit-backdrop-filter: blur(14px);
		backdrop-filter: blur(14px);
		border-bottom: 1px solid transparent;
		transition: border-color 0.2s;
	}
	.bar.compact {
		border-bottom-color: var(--line);
	}
	.row {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		min-height: 48px;
	}
	.left {
		display: flex;
		align-items: center;
		min-width: 0;
	}
	.back {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding-right: 8px;
		color: var(--text);
		text-decoration: none;
		font-size: 16px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.center {
		font-weight: 600;
		font-size: 16px;
		opacity: 0;
		transition: opacity 0.15s;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 52vw;
	}
	.compact .center {
		opacity: 1;
	}
	.right {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 2px;
	}
	.right :global(.icon),
	.icon {
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 12px;
		background: none;
		color: var(--text);
		cursor: pointer;
	}
	.right :global(.icon.on) {
		background: var(--text);
		color: var(--bg);
	}
	.large {
		padding: 2px 0 8px;
	}
	.large h1 {
		margin: 0;
		font-size: 28px;
		line-height: 1.15;
		letter-spacing: -0.01em;
	}
	.large p {
		margin: 2px 0 0;
		color: var(--muted);
		font-size: 14px;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 6;
	}
	.menu {
		position: absolute;
		right: 8px;
		top: calc(env(safe-area-inset-top) + 46px);
		z-index: 7;
		min-width: 220px;
		list-style: none;
		margin: 0;
		padding: 6px;
		background: var(--surface);
		border-radius: 14px;
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.22);
	}
	.menu a,
	.menu button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 44px;
		padding: 0 12px;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		text-decoration: none;
		text-align: left;
		cursor: pointer;
	}
	.menu a:hover,
	.menu button:hover {
		background: var(--bg);
	}
</style>
