import { cacheInbox, cachedInbox, dropInbox, enqueueInbox, flush, pendingInbox } from '../store.js';
import { plainToDoc, type InboxItemView } from '../inbox.js';
import type { DateStr } from '../dates.js';

/** What sorting needs from the server: the days offered, what is planned on them, goals and categories. */
export interface SortData {
	days: DateStr[];
	planned: Record<DateStr, number[]>;
	categories: { id: number; name: string; color: string }[];
	goals: { id: number; title: string; categoryId: number }[];
}

function newId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
	}
}

/**
 * Spec 008 — the inbox on the device: the server list plus writes still waiting in the offline queue,
 * so a thought written without network is in the list (and the counter) at once.
 */
class Inbox {
	open = $state<InboxItemView[]>([]);
	history = $state<InboxItemView[]>([]);
	sort = $state<SortData | null>(null);
	error = $state<string | null>(null);
	/** a short «Во входящих» / «Разобрано» line at the bottom of the screen */
	toast = $state<string | null>(null);
	count = $derived(this.open.length);
	private today: DateStr = '';
	private toastTimer: ReturnType<typeof setTimeout> | undefined;

	say(msg: string) {
		this.toast = msg;
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => (this.toast = null), 1800);
	}

	private async withPending(server: InboxItemView[]) {
		const known = new Set(server.map((i) => i.clientId));
		const waiting = (await pendingInbox())
			.filter((w) => !known.has(w.clientId))
			.map<InboxItemView>((w) => ({ id: null, ...w, updatedAt: w.createdAt, status: 'open', closedAt: null, target: null, pending: true }));
		return [...waiting, ...server].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	async init(today: DateStr) {
		this.today = today;
		const cached = await cachedInbox();
		if (cached) this.open = await this.withPending(cached.filter((i) => !i.pending));
		await this.load();
	}

	async load(today = this.today) {
		this.today = today;
		await flush().catch(() => 0);
		try {
			const r = await fetch(`/api/inbox?today=${today}`);
			if (!r.ok) throw new Error();
			const d = await r.json();
			this.open = await this.withPending(d.open);
			this.history = d.history;
			this.sort = { days: d.days, planned: d.planned, categories: d.categories, goals: d.goals };
			this.error = null;
			await cacheInbox(d.open);
		} catch {
			this.open = await this.withPending(this.open.filter((i) => !i.pending));
		}
	}

	/** Quick capture: into the list at once, then the queue, then the server when there is network. */
	async add(text: string) {
		if (!text.trim()) return;
		const w = { clientId: newId(), text: plainToDoc(text), createdAt: new Date().toISOString() };
		this.open = [{ id: null, ...w, updatedAt: w.createdAt, status: 'open', closedAt: null, target: null, pending: true }, ...this.open];
		this.say('Во входящих');
		await enqueueInbox(w);
		await this.load();
	}

	/** An action on a saved item. Returns the server's answer, or throws with its message. */
	async act(body: Record<string, unknown>): Promise<Record<string, unknown>> {
		const r = await fetch('/api/inbox', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}).catch(() => undefined);
		if (!r) throw new Error('Нет связи с сервером: разобрать можно, когда она будет');
		if (!r.ok) {
			const msg = (await r.json().catch(() => null))?.message ?? 'Не получилось';
			throw Object.assign(new Error(msg), { status: r.status });
		}
		return r.json();
	}

	/** «Сделано» / «Удалить» — also from a swipe. A write still waiting offline can only be removed. */
	async close(item: InboxItemView, action: 'done' | 'delete') {
		this.open = this.open.filter((i) => i.clientId !== item.clientId);
		if (item.id === null) {
			await dropInbox(item.clientId);
			this.say(action === 'done' ? 'Сделано' : 'Удалено');
			return;
		}
		try {
			await this.act({ action, id: item.id });
			this.say(action === 'done' ? 'Сделано' : 'Удалено');
		} catch (e) {
			this.error = (e as Error).message;
		}
		await this.load();
	}
}

export const inbox = new Inbox();
