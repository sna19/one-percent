<script lang="ts">
	import { GOAL_ICONS } from './goalIcons.js';
	import { colorOf } from './palette.js';

	/**
	 * Spec 013 A — the goal's picture: an icon, an emoji or 1–3 letters, white on the category colour.
	 * Big (52) in the goals gallery, small (16–20) as a label in rows and headings.
	 */
	interface Props {
		kind: 'icon' | 'emoji' | 'text';
		value: string;
		/** palette key of the category */
		color: string;
		/** the goal's title: the fallback letters */
		title: string;
		size?: number;
	}
	let { kind, value, color, title, size = 20 }: Props = $props();

	const c = $derived(colorOf(color));
	const Icon = $derived(kind === 'icon' ? GOAL_ICONS[value] : undefined);
	const letters = $derived((kind === 'text' && value.trim()) || title.trim().slice(0, 2));
</script>

<span
	class="gi"
	style="--s:{size}px;--c-light:{c.light};--c-dark:{c.dark};font-size:{Math.round(size * (letters.length > 2 ? 0.34 : 0.42))}px"
	aria-hidden="true"
>
	{#if Icon}<Icon size={Math.round(size * 0.56)} strokeWidth={size >= 40 ? 1.8 : 2.2} />{:else if kind === 'emoji' && value}<span
			class="emoji"
			style="font-size:{Math.round(size * 0.6)}px">{value}</span
		>{:else}{letters}{/if}
</span>

<style>
	.gi {
		--c: var(--c-light);
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--s);
		height: var(--s);
		border-radius: calc(var(--s) * 0.28);
		background: color-mix(in oklab, var(--c) 82%, black);
		color: #fff;
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.02em;
		overflow: hidden;
		vertical-align: middle;
	}
	@media (prefers-color-scheme: dark) {
		.gi {
			--c: var(--c-dark);
		}
	}
	.emoji {
		line-height: 1;
	}
</style>
