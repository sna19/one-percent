<script lang="ts">
	/**
	 * Task 13 — the day note's icon: a calendar with the day's number inside, so it reads «this day».
	 * Drawn like the Lucide icons around it (24 × 24, stroke 2, round caps).
	 */
	interface Props {
		/** day of the month, 1…31 */
		day: number;
		size?: number;
	}
	let { day, size = 22 }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d="M8 2v4" />
	<path d="M16 2v4" />
	<rect width="18" height="18" x="3" y="4" rx="2" />
	<path d="M3 9h18" />
	<text
		x="12"
		y="18.6"
		text-anchor="middle"
		fill="currentColor"
		stroke="none"
		font-size={day > 9 ? 8.5 : 9.5}
		font-weight="700"
		font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">{day}</text
	>
</svg>
