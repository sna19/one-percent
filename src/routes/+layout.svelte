<script lang="ts">
	import type { LayoutProps } from './$types';
	let { children }: LayoutProps = $props();
</script>

{@render children()}

<style>
	:global(:root) {
		--bg: #f6f5f2;
		--surface: #ffffff;
		--text: #1d1d1f;
		--muted: #6e6e73;
		--line: #d8d6d0;
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
