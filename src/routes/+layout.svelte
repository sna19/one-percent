<script lang="ts">
	import { loadAppSettings } from '#lib/appSettings.svelte.js';
	import { onMount } from 'svelte';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import TabBar from '#lib/TabBar.svelte';
	import { inbox } from '#lib/inbox/state.svelte.js';
	import { keyOf, nav, ROOT, tabOf, type Tab } from '#lib/nav.svelte.js';
	import { todayStr } from '#lib/dates.js';
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();

	/**
	 * #21 — the tab bar on every screen. Each tab keeps its stack: switching tabs opens where that tab was,
	 * at the same scroll; a second tap on the active tab goes to its root. Switching replaces the history
	 * entry, so a tab switch is not a step «back».
	 */
	onMount(() => {
		nav.tab = tabOf(page.url, 'today');
		inbox.init(todayStr());
		// #29: the registry's values, kept on the device and refreshed
		loadAppSettings();
		// A new version on the server: the app on the home screen comes back from the background with its old
		// page; when it is shown again and the server's build differs, it reloads once (not while typing).
		const check = async () => {
			if (document.visibilityState !== 'visible') return;
			const r = await fetch('/health', { cache: 'no-store' }).catch(() => undefined);
			const built = r?.ok ? (await r.json().catch(() => null))?.built : null;
			const typing = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
			if (built && built !== __BUILD_TIME__ && !typing) location.reload();
		};
		document.addEventListener('visibilitychange', check);
		check();
	});
	beforeNavigate(({ from }) => {
		if (from?.url) nav.scroll.set(keyOf(from.url), window.scrollY);
	});
	afterNavigate(({ to, type }) => {
		if (!to?.url) return;
		nav.tab = tabOf(to.url, nav.tab);
		nav.last[nav.tab] = keyOf(to.url);
		if (type === 'goto' || type === 'link') nav.restore(keyOf(to.url));
	});

	function select(t: Tab) {
		if (t === nav.tab) {
			// back to the root of this tab, at its start: today, this week, the top
			nav.last[t] = ROOT[t];
			nav.home = {};
			nav.scroll.delete(ROOT[t]);
			nav.rootTap++;
			if (keyOf(page.url) !== ROOT[t]) goto(ROOT[t], { replace: true });
			else window.scrollTo({ top: 0, behavior: 'smooth' });
			return;
		}
		const target = nav.last[t] ?? ROOT[t];
		goto(target, { replace: true, reset: false }).then(() => {
			if (!nav.scroll.has(target)) window.scrollTo(0, 0);
		});
	}
	const root = $derived(page.url.pathname === '/');
</script>

{@render children()}
{#if !root}<div class="tab-spacer" aria-hidden="true"></div>{/if}
<TabBar tab={nav.tab} inboxCount={inbox.count} onselect={select} />

<style>
	/* Spec 012 A: an object's name is a link to its screen — the same look everywhere: no colour change,
	   underlined while pressed */
	:global(a.obj) {
		color: inherit;
		text-decoration: none;
		-webkit-tap-highlight-color: transparent;
	}
	:global(a.obj:active) {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	/* nested screens end above the tab bar; the root screen has its own padding */
	.tab-spacer {
		height: calc(env(safe-area-inset-bottom) + 64px);
	}
	:global(:root) {
		--bg: #f6f5f2;
		--surface: #ffffff;
		--text: #1d1d1f;
		--muted: #6e6e73;
		--line: #d8d6d0;
		--link: #0a66d0;
		--today: #1d1d1f;
		--plus-mix: black 28%;
		--half: 38%;
		color-scheme: light;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #141416;
			--surface: #1e1e21;
			--text: #f2f2f4;
			--muted: #9a9aa2;
			--line: #3a3a40;
			--link: #6cb4ff;
			--today: #f2f2f4;
			--plus-mix: black 18%;
			--half: 30%;
			color-scheme: dark;
		}
	}
	:global(html, body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		-webkit-text-size-adjust: 100%;
		-webkit-tap-highlight-color: transparent;
	}
	:global(button) {
		font: inherit;
		color: inherit;
	}
</style>
