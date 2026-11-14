import { moveTo } from './today.js';

/**
 * Spec 007 B — drag to sort, one way for every list. Put it on the list element; its children carry
 * `data-id`, and each has a handle with `data-handle` (the ≡ icon). While dragging, `preview` gets the
 * live order so the list can re-render; `drop` gets the final order (only when it changed).
 */
export interface SortableParams {
	preview?: (ids: number[] | null) => void;
	drop: (ids: number[]) => void;
}

export function sortable(node: HTMLElement, params: SortableParams) {
	let p = params;
	let dragId: number | null = null;
	let start: number[] = [];
	let ids: number[] = [];
	let handle: HTMLElement | null = null;

	const items = () => [...node.children].filter((c) => (c as HTMLElement).dataset.id) as HTMLElement[];

	function down(e: PointerEvent) {
		const h = (e.target as HTMLElement).closest('[data-handle]') as HTMLElement | null;
		if (!h || !node.contains(h)) return;
		const item = h.closest('[data-id]') as HTMLElement | null;
		if (!item || item.parentElement !== node) return;
		e.preventDefault();
		handle = h;
		h.setPointerCapture(e.pointerId);
		dragId = Number(item.dataset.id);
		start = ids = items().map((c) => Number(c.dataset.id));
		node.classList.add('sorting');
		item.classList.add('dragging');
		h.addEventListener('pointermove', move);
		h.addEventListener('pointerup', up);
		h.addEventListener('pointercancel', up);
	}

	function move(e: PointerEvent) {
		if (dragId === null) return;
		const others = items().filter((c) => Number(c.dataset.id) !== dragId);
		const to = others.filter((c) => {
			const r = c.getBoundingClientRect();
			return r.top + r.height / 2 < e.clientY;
		}).length;
		const next = moveTo(ids, dragId, to);
		if (next.join() !== ids.join()) {
			ids = next;
			p.preview?.(ids);
		}
	}

	function up() {
		handle?.removeEventListener('pointermove', move);
		handle?.removeEventListener('pointerup', up);
		handle?.removeEventListener('pointercancel', up);
		node.classList.remove('sorting');
		node.querySelector('.dragging')?.classList.remove('dragging');
		const changed = ids.join() !== start.join();
		const final = ids;
		dragId = null;
		handle = null;
		if (changed) p.drop(final);
		p.preview?.(null);
	}

	node.addEventListener('pointerdown', down);
	return {
		update(n: SortableParams) {
			p = n;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
		}
	};
}

/** Items in the live drag order (or as they are when nothing is dragged). */
export function inPreview<T>(items: T[], preview: number[] | null, idOf: (x: T) => number): T[] {
	if (!preview) return items;
	const pos = new Map(preview.map((id, i) => [id, i]));
	return [...items].sort((a, b) => (pos.get(idOf(a)) ?? 0) - (pos.get(idOf(b)) ?? 0));
}

/** Saves a drag order on the server. */
export async function saveOrder(kind: 'practice' | 'goal' | 'category' | 'format' | 'template', ids: number[]) {
	const r = await fetch('/api/order', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ kind, ids })
	});
	if (!r.ok) throw new Error('Порядок не сохранился');
}
