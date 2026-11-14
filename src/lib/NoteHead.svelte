<script lang="ts">
	import FilePen from '@lucide/svelte/icons/file-pen';
	import DayIcon from './DayIcon.svelte';

	/**
	 * Task 13 — the small heading over a note, the same on the card and in the editor sheet, so the two
	 * notes never get mixed up: «Всегда» with a document-and-pencil for the practice's standing note,
	 * «Ср, 18 ноября» with a calendar showing the day for the day note.
	 */
	interface Props {
		kind: 'practice' | 'day';
		/** the day note's date label, e.g. «Ср, 18 ноября» */
		label?: string;
		/** the day note's day of the month, for the icon */
		day?: number;
	}
	let { kind, label, day = 1 }: Props = $props();
</script>

<span class="note-head">
	{#if kind === 'practice'}<FilePen size={15} />{:else}<DayIcon {day} size={15} />{/if}
	<span>{kind === 'practice' ? 'Всегда' : label}</span>
</span>

<style>
	.note-head {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		opacity: 0.75;
	}
	.note-head :global(svg) {
		flex: none;
	}
</style>
