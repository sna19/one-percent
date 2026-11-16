<script lang="ts">
	import Star from '@lucide/svelte/icons/star';
	import FilePen from '@lucide/svelte/icons/file-pen';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Target from '@lucide/svelte/icons/target';
	import Shapes from '@lucide/svelte/icons/shapes';
	import Layers from '@lucide/svelte/icons/layers';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Plus from '@lucide/svelte/icons/plus';
	import Archive from '@lucide/svelte/icons/archive';
	import LinkIcon from '@lucide/svelte/icons/link';
	import ChevronsDownUp from '@lucide/svelte/icons/chevrons-down-up';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import History from '@lucide/svelte/icons/history';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import Flag from '@lucide/svelte/icons/flag';
	import CalendarArrowRight from '@lucide/svelte/icons/calendar-arrow-right';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';
	import type { Component } from 'svelte';
	import DayIcon from '../DayIcon.svelte';
	import { todayStr } from '../dates.js';

	let { name, size = 18 }: { name: string; size?: number } = $props();

	const MAP: Record<string, Component<{ size?: number }>> = {
		star: Star,
		note: FilePen,
		grip: GripVertical,
		settings: SettingsIcon,
		pencil: Pencil,
		more: Ellipsis,
		left: ChevronLeft,
		right: ChevronRight,
		target: Target,
		shapes: Shapes,
		layers: Layers,
		'calendar-plus': CalendarPlus,
		plus: Plus,
		archive: Archive,
		link: LinkIcon,
		collapse: ChevronsDownUp,
		expand: ChevronsUpDown,
		history: History,
		help: CircleHelp,
		inbox: InboxIcon,
		flag: Flag,
		when: CalendarArrowRight,
		sliders: SlidersHorizontal,
		'badge-check': BadgeCheck
	};
	const Icon = $derived(MAP[name]);
</script>

<span class="hicon" aria-hidden="true"
	>{#if name === 'check'}<span class="box" style="width:{size}px;height:{size}px"></span>{:else if name === 'day'}<DayIcon day={Number(todayStr().slice(8))} {size} />{:else if Icon}<Icon {size} />{:else}?{/if}</span
>

<style>
	/* the card's mark box is drawn in CSS, not an icon — the same look here */
	.box {
		display: inline-block;
		box-sizing: border-box;
		border: 2px solid currentColor;
		border-radius: 6px;
	}
	.hicon {
		display: inline-flex;
		vertical-align: -3px;
		margin: 0 1px;
	}
</style>
