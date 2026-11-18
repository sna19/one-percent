<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { addDays, todayStr, weekDays, weekStart } from '#lib/dates.js';
	import { colorOf } from '#lib/palette.js';
	import { counts, daysWithout, depth, priority } from '#lib/rules.js';
	import {
		dayScore,
		groupCell,
		groupDaysWithout,
		groupPractices,
		planDayScore,
		planPractices,
		planWeekSummary,
		type Lens
	} from '#lib/groups.js';
	import { cacheWeek, cachedWeek, enqueue, enqueueDayNote, enqueueNote, flush, pending, pendingDayNotes, pendingNotes } from '#lib/store.js';
	import { dayTitle, doseHint, mergeOrder, moveTo, todayLists } from '#lib/today.js';
	import { crossfade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import NoteSheet from '#lib/NoteSheet.svelte';
	import DeedSheet from '#lib/DeedSheet.svelte';
	import TopBar from '#lib/TopBar.svelte';
	import { page } from '$app/state';
	import { keyOf, nav, screenOf } from '#lib/nav.svelte.js';
	import QuickCapture from '#lib/inbox/QuickCapture.svelte';
	import InboxScreen from '#lib/inbox/InboxScreen.svelte';
	import { inbox } from '#lib/inbox/state.svelte.js';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Target from '@lucide/svelte/icons/target';
	import Shapes from '@lucide/svelte/icons/shapes';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Layers from '@lucide/svelte/icons/layers';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Star from '@lucide/svelte/icons/star';
	import Flag from '@lucide/svelte/icons/flag';
	import LinkIcon from '@lucide/svelte/icons/link';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import { backFrom } from '#lib/back.js';
	import CalendarArrowRight from '@lucide/svelte/icons/calendar-arrow-right';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import WhenSheet from '#lib/WhenSheet.svelte';
	import { deedToday, type StepView } from '#lib/steps.js';
	import { appNum, appSettings, setAppSettings } from '#lib/appSettings.svelte.js';
	import Rows3 from '@lucide/svelte/icons/rows-3';
	import { buildTree } from '#lib/tree.js';
	import GoalImage from '#lib/GoalImage.svelte';
	import ChartNoAxesColumn from '@lucide/svelte/icons/chart-no-axes-column';
	import MilestoneCheck from '#lib/milestone/MilestoneCheck.svelte';
	import { amountLabel, budgetLabel, remaining, todayAdds } from '#lib/milestones.js';
	import FilePen from '@lucide/svelte/icons/file-pen';
	import NoteHead from '#lib/NoteHead.svelte';
	import PracticeTree from '#lib/PracticeTree.svelte';
	import { treeOfPractices } from '#lib/tree.js';
	import DayIcon from '#lib/DayIcon.svelte';
	import NoteView from '#lib/NoteView.svelte';
	import { checklistAmount, checklistStats, firstBlockDoc, firstLine, isEmptyNote, toggleTask, type NoteDoc } from '#lib/note.js';
	import type { PracticeView, WeekData } from '#lib/types.js';

	const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
	const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

	let today = $state(todayStr());
	let start = $state(weekStart(todayStr()));
	let week = $state<WeekData | undefined>();
	let offline = $state(false);
	/** Why the last load failed: no network, or the server answered with an error. */
	let problem = $state<string | undefined>();
	let queued = $state(0);
	/** Spec 005: the practice sheet (dose for a day + the standing note). */
	/** Spec 006: a planned day opens on its day note, with a link to the practice's standing note. */
	let sheet = $state<{ pid: number; date: string; mode: 'day' | 'practice' } | undefined>();
	const sheetPractice = $derived(sheet ? week?.practices.find((x) => x.id === sheet!.pid) : undefined);
	function openSheet(p: PracticeView, date: string, mode?: 'day' | 'practice') {
		clearTimeout(timer);
		sheet = { pid: p.id, date, mode: mode ?? (isPlanned(p.id, date) ? 'day' : 'practice') };
	}
	const dayNoteOf = (pid: number, date: string): NoteDoc | null => week?.plan?.notes?.[`${pid}|${date}`]?.note ?? null;
	/** marked by its day checklist: the practice has the setting and the day note has boxes */
	const byChecklist = (p: PracticeView, date: string) =>
		p.checklistMarks && checklistStats(dayNoteOf(p.id, date)).total > 0;

	const days = $derived(weekDays(start));
	const isCurrentWeek = $derived(start === weekStart(today));

	const amountOf = (pid: number, date: string) => week?.entries[pid]?.[date];

	// Per-device view settings (Spec 002): lens and which groups are open.
	const read = <T,>(k: string, fallback: T): T => {
		try {
			const v = localStorage.getItem(k);
			return v ? (JSON.parse(v) as T) : fallback;
		} catch {
			return fallback;
		}
	};
	const write = (k: string, v: unknown) => {
		try {
			localStorage.setItem(k, JSON.stringify(v));
		} catch {
			/* private mode: keep in memory only */
		}
	};
	/**
	 * Spec 004: three tabs. «Сегодня» always opens first (not remembered, so a morning starts on the
	 * working screen); «Неделя» is the plan view of Spec 003; «Всё» holds the goal / format lens.
	 */
	type View = 'plan' | Lens;
	// #21: the tab comes from the address (the tab bar lives in the layout and keeps each tab's stack)
	const tab = $derived(screenOf(page.url));
	let capture: QuickCapture;
	let allLens = $state<Lens>(read('all-lens', 'goal'));
	const lens = $derived<View>(tab === 'week' ? 'plan' : allLens);
	let open = $state<string[]>(read('open-groups', []));
	// a second tap on the active tab: back to its start — today, this week
	let seenRootTap = nav.rootTap;
	$effect(() => {
		if (nav.rootTap === seenRootTap) return;
		seenRootTap = nav.rootTap;
		expanded = null;
		if (tab === 'today') viewDay = today;
		if (start !== weekStart(today)) toToday();
	});
	function setLens(l: Lens) {
		allLens = l;
		write('all-lens', l);
	}
	function toggle(key: string) {
		open = open.includes(key) ? open.filter((k) => k !== key) : [...open, key];
		write('open-groups', open);
	}

	const practices = $derived(week?.practices ?? []);
	const plannedSet = $derived(
		new Set(Object.entries(week?.plan?.items ?? {}).flatMap(([pid, ds]) => ds.map((d) => `${pid}|${d}`)))
	);
	const isPlanned = (pid: number, d: string) => plannedSet.has(`${pid}|${d}`);
	const isPlan = $derived(lens === 'plan');
	// #25: on «Всё» by goals the rows follow the navigator — categories, then goals in the settings order — and
	// can be searched
	let allQuery = $state('');
	const nq = (x: string) => x.toLocaleLowerCase('ru').replace(/ё/g, 'е');
	const allPractices = $derived.by(() => {
		const q = nq(allQuery.trim());
		const ps = q ? practices.filter((p) => [p.title, p.goalTitle, p.categoryName, p.formatName ?? ''].some((t) => nq(t).includes(q))) : practices;
		if (lens !== 'goal') return ps;
		// owner (2026-11-16): goals with a ★ practice first, then the categories in the settings order
		const star = new Set(ps.filter((p) => p.recommended).map((p) => p.goalId));
		const rank = (p: PracticeView) => (star.has(p.goalId) ? 0 : 1);
		return [...ps].sort(
			(a, b) => rank(a) - rank(b) || (rank(a) ? a.categoryOrder - b.categoryOrder || a.categoryId - b.categoryId : 0) || a.goalOrder - b.goalOrder || a.goalId - b.goalId
		);
	});
	/** the section of a goal row on «Всё»: «★» or its category */
	const starGoals = $derived(new Set(allPractices.filter((p) => p.recommended).map((p) => p.goalId)));
	const sectionOf = (g: { practices: PracticeView[] }) => (starGoals.has(g.practices[0].goalId) ? 'star' : `c${g.practices[0].categoryId}`);
	// sections fold, and what is folded is remembered on this device
	let foldedSections = $state<string[]>(read('all-sections-folded', []));
	function toggleSection(k: string) {
		foldedSections = foldedSections.includes(k) ? foldedSections.filter((x) => x !== k) : [...foldedSections, k];
		write('all-sections-folded', foldedSections);
	}
	const sectionShown = (g: { practices: PracticeView[] }) => isPlan || lens !== 'goal' || !!allQuery.trim() || !foldedSections.includes(sectionOf(g));
	const groups = $derived(
		isPlan
			? groupPractices(planPractices(practices, days, isPlanned, amountOf), 'goal')
			: groupPractices(allPractices, lens as Lens)
	);
	/** the category heading goes before the first goal of each category (goal lens on «Всё») */
	const catStart = (i: number) => !isPlan && lens === 'goal' && (i === 0 || sectionOf(groups[i - 1]) !== sectionOf(groups[i]));
	const summary = $derived(planWeekSummary(practices, days, isPlanned, amountOf));
	/** Spec 007 E: Today pages by day — this week and next. */
	let viewDay = $state(todayStr());
	const isFutureDay = $derived(viewDay > today);
	// owner (2026-11-16): back into past weeks as far as the history goes; forward — this week and next
	const minDay = '2000-01-02';
	const maxDay = $derived(addDays(weekStart(today), 13));
	// Spec 010 «Ротация»: weeks where a goal had no practices in the plan do not add to «N дней без»
	const paused = $derived(new Map(Object.entries(week?.pausedWeeks ?? {}).map(([g, ws]) => [Number(g), new Set(ws)])));
	const pausedOf = (goalId: number) => paused.get(goalId);
	const dueCheck = $derived(
		Object.values(week?.milestones ?? {})
			.filter((m) => m.dueDate && m.dueDate <= today && (!m.snoozedUntil || m.snoozedUntil <= today))
			.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]
	);
	const day = $derived(todayLists(practices, viewDay, isPlanned, amountOf, pausedOf));
	// #12: «Сделать что-то ещё» — recommended first as their own list, the rest as the settings tree
	const recommended = $derived(day.other.filter((p) => p.recommended));
	const otherTree = $derived(treeOfPractices(day.other.filter((p) => !p.recommended)));
	function dayName(d: string) {
		if (d === today) return 'Сегодня';
		if (d === addDays(today, 1)) return 'Завтра';
		if (d === addDays(today, -1)) return 'Вчера';
		return dayTitle(d);
	}
	function showDay(d: string) {
		if (d < minDay || d > maxDay) return;
		viewDay = d;
		const s = weekStart(d);
		if (s !== start) {
			start = s;
			week = undefined;
			load(s);
		}
	}
	// horizontal swipe on the day screen = previous / next day
	let swipe: { x: number; y: number } | null = null;
	function swipeStart(e: PointerEvent) {
		if (reorder || e.pointerType === 'mouse') return;
		swipe = { x: e.clientX, y: e.clientY };
	}
	function swipeEnd(e: PointerEvent) {
		if (!swipe) return;
		const dx = e.clientX - swipe.x;
		const dy = e.clientY - swipe.y;
		swipe = null;
		if (Math.abs(dx) > 70 && Math.abs(dy) < 45) showDay(addDays(viewDay, dx < 0 ? 1 : -1));
	}
	/** future day: change what is planned for it (today: unchanged rules; past: locked) */
	async function setPlanned(p: PracticeView, planned: boolean) {
		if (!planned && dayNoteOf(p.id, viewDay) && !window.confirm(`Убрать «${p.title}» из плана дня? Заметка дня удалится.`)) return;
		try {
			const r = await fetch('/api/plan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'item', start: weekStart(viewDay), today, practiceId: p.id, date: viewDay, planned })
			});
			if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Не сохранилось');
			sheet = undefined;
			await load();
		} catch (e) {
			problem = (e as Error).message;
		}
	}
	let moreOpen = $state(false);
	/** task 13: the card whose «±» quantity field is open */
	let qtyOpen = $state<number | undefined>();
	/** Spec 012 B: the «Когда» sheet */
	let whenFor = $state<{ p: PracticeView; day: string } | null>(null);

	/** «3 рекомендовано · 15», or just «15» */
	function otherCount(other: PracticeView[]) {
		const rec = other.filter((x) => x.recommended).length;
		return rec ? `${rec} рекомендовано · ${other.length}` : String(other.length);
	}

	// #28: steps — one-off tasks of a goal; a practice's step is its precondition («сначала»)
	let stepsShowAll = $state(false);
	// #30: the list also carries deeds done in the last day and a half — for «Сделано» on today
	const openStepsList = $derived((week?.steps ?? []).filter((s) => !s.doneAt));
	const localDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
	const doneDeedsToday = $derived((week?.steps ?? []).filter((s) => s.doneAt && localDay(s.doneAt) === viewDay && s.practiceId === null));
	const stepsOfPractice = (pid: number) => openStepsList.filter((s) => s.practiceId === pid);
	const stepOf = (p: PracticeView) => stepsOfPractice(p.id)[0];
	const goalStepsToday = $derived(
		openStepsList.filter((s) => s.practiceId === null && (!!week?.plan?.focus?.includes(s.goalId) || (!!s.plannedDate && s.plannedDate <= viewDay)))
	);
	async function stepCall(body: Record<string, unknown>) {
		const r = await fetch('/api/steps', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
		if (!r?.ok) {
			problem = (await r?.json().catch(() => null))?.message ?? 'Нет связи с сервером';
			return null;
		}
		return r.json();
	}
	async function stepDone(st: StepView) {
		// the two-zone view keeps it struck through in «Сделано» until the day ends; the old one hides it
		if (week?.steps) week.steps = zones ? week.steps.map((x) => (x.id === st.id ? { ...x, doneAt: new Date().toISOString() } : x)) : week.steps.filter((x) => x.id !== st.id);
		if (!(await stepCall({ action: 'done', id: st.id }))) return load();
		const where = st.practiceId ? (practices.find((x) => x.id === st.practiceId)?.title ?? st.goalTitle) : st.goalTitle;
		flash = {
			text: `Дело сделано → ${where}`,
			goalId: st.goalId,
			undo: async () => {
				await stepCall({ action: 'undone', id: st.id });
				await load();
			}
		};
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 5000);
	}
	// ── #30 «Дела и навыки»: the two-zone view of «Сегодня» ──
	const zones = $derived(appSettings.v['today.layout'] !== 'classic');
	async function setLayout(v: 'zones' | 'classic') {
		const r = await fetch('/api/app-settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'today.layout', value: v }) }).catch(() => undefined);
		if (r?.ok) setAppSettings((await r.json()).values);
		else problem = 'Не сохранилось: нет связи с сервером';
	}
	const isArea = (p: PracticeView) => p.goalKind === 'area';
	type DeedRow = { kind: 'deed'; st: StepView } | { kind: 'first'; st: StepView; p: PracticeView } | { kind: 'area'; p: PracticeView };
	// what goes to the deeds zone — the owner marks nothing: deeds whose day or deadline has come, the «сначала» step
	// of a practice planned today, and the planned practices of spheres
	const deedRows = $derived.by((): DeedRow[] => {
		if (!week) return [];
		const rows: DeedRow[] = [];
		for (const st of openStepsList) if (deedToday(st, viewDay)) rows.push({ kind: 'deed', st });
		for (const p of day.todo) {
			if (isArea(p)) rows.push({ kind: 'area', p });
			else if (stepOf(p)) rows.push({ kind: 'first', st: stepOf(p)!, p });
		}
		return rows;
	});
	const deedsDone = $derived([...doneDeedsToday.map((st) => ({ id: `s${st.id}`, title: st.title, where: st.goalTitle })), ...day.done.filter((d) => isArea(d.p)).map((d) => ({ id: `p${d.p.id}`, title: d.p.title, where: d.p.goalTitle }))]);
	const skillsTodo = $derived(day.todo.filter((p) => !isArea(p)));
	const skillsDone = $derived(day.done.filter((d) => !isArea(d.p)));
	const skillsPlanned = $derived(skillsTodo.length + skillsDone.filter((d) => !d.bonus).length);
	let deedsAll = $state(false);
	// «+ дело»: the title, its sphere or goal (the last used first), for the day on screen
	let deedTitle = $state('');
	let deedGoal = $state<{ id: number; title: string } | null>(null);
	let pickingGoal = $state(false);
	onMount(() => {
		try {
			deedGoal = JSON.parse(localStorage.getItem('deed-last-goal') ?? 'null');
		} catch {
			/* private mode */
		}
	});
	const goalTree = $derived(
		buildTree(
			[...new Map((week?.goals ?? []).map((g) => [g.categoryId, { id: g.categoryId, name: g.categoryName, color: g.color, sortOrder: g.categoryOrder, archivedAt: null }])).values()],
			(week?.goals ?? []).map((g) => ({ id: g.id, title: g.title, categoryId: g.categoryId, sortOrder: g.sortOrder, archivedAt: null })),
			[]
		).filter((c) => c.goals.length)
	);
	function pickDeedGoal(g: { id: number; title: string }) {
		deedGoal = { id: g.id, title: g.title };
		pickingGoal = false;
		try {
			localStorage.setItem('deed-last-goal', JSON.stringify(deedGoal));
		} catch {
			/* not critical */
		}
	}
	async function addDeed(e: SubmitEvent) {
		e.preventDefault();
		const t = deedTitle.trim();
		if (!t) return;
		if (!deedGoal) return (pickingGoal = true);
		deedTitle = '';
		if (await stepCall({ action: 'create', goalId: deedGoal.id, title: t, plannedDate: viewDay < today ? today : viewDay })) await load();
	}
	// a deed's description with its subtasks (a checklist) — ticked right here, saved into the deed's note
	async function toggleDeedTask(st: StepView, i: number) {
		if (!st.note) return;
		const note = toggleTask(st.note, i);
		if (week?.steps) week.steps = week.steps.map((x) => (x.id === st.id ? { ...x, note } : x));
		if (!(await stepCall({ action: 'update', id: st.id, fields: { note } }))) await load();
	}
	/** a tap on a deed's row opens its sheet — the same as on the goal's screen */
	let deedSheetId = $state<number | null>(null);
	const deedSheet = $derived(deedSheetId === null ? undefined : week?.steps?.find((x) => x.id === deedSheetId));
	async function saveDeed(fields: Record<string, unknown>) {
		const id = deedSheetId;
		if (id === null) return;
		if (week?.steps) week.steps = week.steps.map((x) => (x.id === id ? { ...x, ...fields } as StepView : x));
		if (!(await stepCall({ action: 'update', id, fields }))) await load();
	}
	async function removeDeed() {
		const st = deedSheet;
		if (!st || !confirm(`Убрать дело «${st.title}»?`)) return;
		deedSheetId = null;
		if (week?.steps) week.steps = week.steps.filter((x) => x.id !== st.id);
		await stepCall({ action: 'delete', id: st.id });
		await load();
	}
	async function closeDeed() {
		deedSheetId = null;
		await load();
	}
	/** a row of «Дела» opened in place, like a skill's card: `p<id>` a sphere's practice, `s<id>` a deed */
	let deedOpen = $state<string | null>(null);
	let deedWhen = $state<number | null>(null);
	const toggleDeedRow = (k: string) => {
		deedOpen = deedOpen === k ? null : k;
		deedWhen = null;
		qtyOpen = undefined;
	};
	async function planDeed(st: StepView, date: string | null) {
		deedWhen = null;
		if (week?.steps) week.steps = week.steps.map((x) => (x.id === st.id ? { ...x, plannedDate: date } : x));
		if (!(await stepCall({ action: 'update', id: st.id, fields: { plannedDate: date } }))) await load();
	}
	async function areaDone(p: PracticeView) {
		await mark(p, viewDay, counts(amountOf(p.id, viewDay), p) ? 0 : p.normDose);
	}

	async function addStep(p: PracticeView, f: HTMLFormElement) {
		const input = f.elements.namedItem('step') as HTMLInputElement;
		const title = input.value.trim();
		if (!title) return;
		input.value = '';
		if (await stepCall({ action: 'create', goalId: p.goalId, practiceId: p.id, title })) await load();
	}

	// #27: the link icon — the practice's note links go to the «Ссылки» tab
	async function toggleInLinks(p: PracticeView) {
		const on = !p.inLinks;
		const x = week?.practices.find((q) => q.id === p.id);
		if (x) x.inLinks = on;
		const r = await fetch('/api/links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'set', practiceId: p.id, on }) }).catch(() => undefined);
		if (!r?.ok) {
			if (x) x.inLinks = !on;
			problem = 'Не сохранилось: нет связи с сервером';
		}
	}

	// task 12: the «Рекомендовать» star — shown at once, saved on the server; back on failure
	async function toggleRecommended(p: PracticeView) {
		const on = !p.recommended;
		const set = (v: boolean) => {
			const x = week?.practices.find((q) => q.id === p.id);
			if (x) x.recommended = v;
		};
		set(on);
		try {
			const r = await fetch('/api/settings/recommend', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: p.id, on })
			});
			if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Не сохранилось');
		} catch (e) {
			set(!on);
			problem = (e as Error).message;
		}
	}

	// «Порядок» (#9): drag cards by their ≡ handle; the order is the practices' order everywhere.
	/** 'tree' — a card in the tree of «Сделать что-то ещё»: its order comes from settings, no drag here */
	type ListName = 'todo' | 'done' | 'other' | 'tree';
	let reorder = $state(false);
	let drag = $state<{ list: ListName; id: number; ids: number[] } | undefined>();
	const listEls: Partial<Record<ListName, HTMLUListElement>> = {};
	function inOrder<T>(list: ListName, items: T[], idOf: (x: T) => number): T[] {
		if (drag?.list !== list) return items;
		const pos = new Map(drag.ids.map((id, i) => [id, i]));
		return [...items].sort((a, b) => (pos.get(idOf(a)) ?? 0) - (pos.get(idOf(b)) ?? 0));
	}
	function dragStart(e: PointerEvent, list: ListName, id: number, ids: number[]) {
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = { list, id, ids };
	}
	function dragMove(e: PointerEvent) {
		if (!drag) return;
		const ul = listEls[drag.list];
		if (!ul) return;
		const others = [...ul.children].filter((li) => (li as HTMLElement).dataset.id !== String(drag!.id));
		const to = others.filter((li) => {
			const r = li.getBoundingClientRect();
			return r.top + r.height / 2 < e.clientY;
		}).length;
		const next = moveTo(drag.ids, drag.id, to);
		if (next.join() !== drag.ids.join()) drag = { ...drag, ids: next };
	}
	async function dragEnd() {
		if (!drag || !week) return (drag = undefined);
		const order = mergeOrder(week.practices.map((p) => p.id), drag.ids);
		drag = undefined;
		const pos = new Map(order.map((id, i) => [id, i]));
		week.practices = [...week.practices].sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
		await cacheWeek($state.snapshot(week));
		try {
			const r = await fetch('/api/order', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids: order })
			});
			if (!r.ok) throw new Error();
		} catch {
			problem = 'Порядок не сохранился: нет связи с сервером';
			offline = true;
		}
	}
	const [send, receive] = crossfade({ duration: 220 });

	// Spec 007 F: a tap opens one card at a time (not in «Порядок»)
	let expanded = $state<number | null>(null);
	function toggleCard(id: number) {
		if (reorder) return;
		expanded = expanded === id ? null : id;
	}

	const nOf = (p: PracticeView) => daysWithout(p.lastDone, p.createdOn, today, pausedOf(p.goalId));
	// Priority is chosen among goals; in the plan view only among goals planned for today.
	const top = $derived(
		priority(
			groupPractices(practices, 'goal')
				.filter((g) => !isPlan || g.practices.some((p) => isPlanned(p.id, today)))
				.map((g) => ({
					id: g.practices[0].goalId,
					title: g.title,
					n: groupDaysWithout(g, today, pausedOf),
					doneToday: g.practices.some((p) => p.lastDone === today)
				}))
		)
	);
	const SOURCE_LABEL: Record<string, string> = {
		previous: 'по прошлой неделе',
		default: 'по обычным дням практик',
		empty: 'с нуля'
	};
	const sourceLabel = (src: string) =>
		SOURCE_LABEL[src] ??
		(src.startsWith('template:') ? 'по шаблону недели' : src.startsWith('week:') ? `по неделе с ${label(src.slice(5))}` : '');

	let confirming = $state(false);
	async function confirmDraft() {
		confirming = true;
		try {
			const r = await fetch('/api/plan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'confirm', start, today })
			});
			if (r.ok) await load();
		} catch {
			problem = 'Нет связи с сервером';
		} finally {
			confirming = false;
		}
	}

	function without(n: number) {
		const w = n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'дня' : 'дней';
		return `${n} ${w} без`;
	}

	function label(s: string) {
		const [, m, d] = s.split('-').map(Number);
		return `${d} ${MONTHS[m - 1]}`;
	}

	async function withPending(w: WeekData) {
		for (const m of await pending()) apply(w, m.practiceId, m.date, m.amount);
		for (const n of await pendingDayNotes()) {
			const k = `${n.practiceId}|${n.date}`;
			const cur = w.plan?.notes?.[k];
			if (w.plan && (!cur?.updatedAt || n.updatedAt > cur.updatedAt)) {
				if (n.note) w.plan.notes[k] = { note: n.note, updatedAt: n.updatedAt };
				else delete w.plan.notes[k];
			}
		}
		for (const n of await pendingNotes()) {
			const p = w.practices.find((x) => x.id === n.practiceId);
			if (p && (!p.noteUpdatedAt || n.updatedAt > p.noteUpdatedAt)) {
				p.note = n.note;
				p.noteUpdatedAt = n.updatedAt;
			}
		}
		return w;
	}

	async function load(s = start) {
		const cached = await cachedWeek(s);
		if (cached) await withPending(cached);
		if (cached && !week && s === start) week = cached;
		let r: Response;
		try {
			r = await fetch(`/api/week?start=${s}&today=${today}`);
		} catch {
			offline = true;
			problem = 'Нет связи с сервером';
			if (s === start) week = cached ?? week;
			queued = (await pending()).length;
			return;
		}
		try {
			const isJson = r.headers.get('content-type')?.includes('json');
			if (!r.ok || !isJson) {
				const body = isJson ? ((await r.json()).message ?? '') : '';
				throw new Error(`Ошибка сервера ${r.status}${body ? `: ${body}` : ''}`);
			}
			const fresh: WeekData = await r.json();
			await cacheWeek(fresh);
			await withPending(fresh); // local marks not on the server yet
			if (s === start) week = fresh;
			offline = false;
			problem = undefined;
		} catch (e) {
			offline = true;
			problem = e instanceof Error && e.message ? e.message : 'Ошибка сервера';
			if (s === start) week = cached ?? week;
		}
		queued = (await pending()).length;
		// #24: a volume finished while offline is written to the goal's path once everything is sent
		if (!offline && !queued && s === start && week?.volumes)
			for (const [id, v] of Object.entries(week.volumes)) {
				const p = week.practices.find((x) => x.id === Number(id));
				if (p && !v.doneOn && volPos(p) >= v.total) await volumeCheck(p);
			}
	}

	function apply(w: WeekData, pid: number, date: string, amount: number) {
		(w.entries[pid] ??= {})[date] = amount;
		const p = w.practices.find((x) => x.id === pid);
		if (p && amount >= p.minDose && date <= today && (!p.lastDone || date > p.lastDone)) p.lastDone = date;
	}

	// Spec 009 C: a short flash after a mark — what it added to the goal's milestone; a tap opens the goal
	let flash = $state<{ text: string; goalId: number; undo?: () => void } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	function milestoneFlash(p: PracticeView, old: number, amount: number, before: number) {
		const m = week?.milestones?.[p.goalId];
		if (!m || !counts(amount, p) || amount <= old) return;
		const after = m.progressBefore + todayAdds(m, practices, (id) => amountOf(id, today), today);
		let text: string;
		if (m.budgetKind !== 'none' && m.budgetTarget) {
			if (before < m.budgetTarget && after >= m.budgetTarget) text = 'Бюджет майлстона набран — проверишь себя?';
			else {
				const plus = m.budgetKind === 'amount' && p.unit === m.budgetUnit ? `+${amountLabel(amount - old, p.unit)} ` : after > before ? '+1 занятие ' : '';
				text = `${plus}→ ${m.title} · ${budgetLabel(m, after)}`;
			}
		} else {
			const rem = remaining(m.dueDate, today);
			text = `→ ${m.title}${rem ? ` · ${rem}` : ''}`;
		}
		// #29: how long it stays is the registry's «today.flash» (0 — no flash)
		const ms = appNum('today.flash');
		if (!ms) return;
		flash = { text, goalId: p.goalId };
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), ms);
	}

	// #24: a practice with a volume (a book)
	const fmtN = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
	function volPos(p: PracticeView): number {
		const v = week?.volumes?.[p.id];
		if (!v) return 0;
		return v.before + (today >= v.since ? (amountOf(p.id, today) ?? 0) : 0);
	}
	let nextFor = $state<number | null>(null);
	/** #24: «142 / 320 стр · осталось 178» in place of the dose hint, «Пройдено · 320 стр» at the end */
	function volCaption(p: PracticeView): string {
		const v = week?.volumes?.[p.id];
		if (!v) return '';
		if (v.doneOn) return `Пройдено · ${fmtN(v.total)} ${p.unit}`;
		const pos = volPos(p);
		return `${fmtN(pos)} / ${fmtN(v.total)} ${p.unit} · осталось ${fmtN(Math.max(0, v.total - pos))}`;
	}
	async function volumeCall(body: Record<string, unknown>) {
		const r = await fetch('/api/volume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ today, ...body }) }).catch(() => undefined);
		const j = await r?.json().catch(() => null);
		if (!r?.ok) {
			problem = j?.message ?? 'Нет связи с сервером';
			return null;
		}
		return j;
	}
	async function volumeAt(p: PracticeView, f: HTMLFormElement) {
		const at = Number(String(new FormData(f).get('at') ?? '').replace(',', '.'));
		if (!Number.isFinite(at)) return;
		if (await volumeCall({ action: 'at', practiceId: p.id, at })) {
			await load();
			await volumeCheck(p);
		}
	}
	async function volumeNext(p: PracticeView, f: HTMLFormElement) {
		const fd = new FormData(f);
		const total = Number(String(fd.get('total') ?? '').replace(',', '.'));
		if (await volumeCall({ action: 'next', practiceId: p.id, total, title: fd.get('title') })) {
			nextFor = null;
			await load();
		}
	}
	async function volumeEnd(p: PracticeView) {
		if (!confirm(`Закончить «${p.title}»? Практика уйдёт в архив, история и пройденное останутся.`)) return;
		if (await volumeCall({ action: 'end', practiceId: p.id })) await load();
	}
	/** finished just now: written to the goal's path once, with a quiet flash */
	async function volumeCheck(p: PracticeView) {
		const v = week?.volumes?.[p.id];
		if (!v || v.doneOn || volPos(p) < v.total) return;
		const r = await volumeCall({ action: 'finish', practiceId: p.id });
		if (r?.done) {
			v.doneOn = today;
			flash = { text: `${p.unit.startsWith('стр') ? 'Книга прочитана' : 'Пройдено'} · ${fmtN(r.done.total)} ${p.unit} за ${r.done.days} ${r.done.days % 10 === 1 && r.done.days % 100 !== 11 ? 'день' : [2, 3, 4].includes(r.done.days % 10) && ![12, 13, 14].includes(r.done.days % 100) ? 'дня' : 'дней'}`, goalId: p.goalId };
			clearTimeout(flashTimer);
			flashTimer = setTimeout(() => (flash = null), 3500);
		}
	}

	async function mark(p: PracticeView, date: string, amount: number) {
		if (!week || date > today) return;
		const old = amountOf(p.id, date) ?? 0;
		const m = week.milestones?.[p.goalId];
		const before = m ? m.progressBefore + todayAdds(m, practices, (id) => amountOf(id, today), today) : 0;
		apply(week, p.id, date, amount);
		if (date === today) milestoneFlash(p, old, amount, before);

		await cacheWeek($state.snapshot(week));
		await enqueue({ practiceId: p.id, date, amount });
		queued = await flush();
		offline = queued > 0;
		// #24: after the mark reached the server — the finish is counted there
		if (date === today && amount > old && !offline) volumeCheck(p);
		// clearing may move lastDone back — let the server recount
		if (!offline && amount < p.minDose) load();
	}

	function go(delta: number) {
		start = addDays(start, 7 * delta);
		week = undefined;
		load(start);
	}

	function toToday() {
		start = weekStart(today);
		week = undefined;
		load(start);
	}

	// Tap = norm, long press = choice. One touch for the daily mark.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let longPressed = false;
	function down(p: PracticeView, date: string) {
		if (reorder) return;
		longPressed = false;
		clearTimeout(timer);
		timer = setTimeout(() => {
			longPressed = true;
			navigator.vibrate?.(10);
			openSheet(p, date);
		}, 450);
	}
	function cancel() {
		clearTimeout(timer);
	}
	function tap(p: PracticeView, date: string) {
		clearTimeout(timer);
		if (longPressed) return;
		mark(p, date, p.normDose);
	}

	/** Spec 006: day note of a planned day; for a practice marked by checklist the mark follows the boxes. */
	async function saveDayNote(p: PracticeView, date: string, live: NoteDoc | null) {
		// notes shown on screen are reactive proxies; the queue (IndexedDB) needs a plain copy
		const doc = live ? ($state.snapshot(live) as NoteDoc) : null;
		const edit = { practiceId: p.id, date, note: doc, updatedAt: new Date().toISOString(), today };
		if (week?.plan) {
			const k = `${p.id}|${date}`;
			if (doc) week.plan.notes = { ...week.plan.notes, [k]: { note: doc, updatedAt: edit.updatedAt } };
			else {
				const { [k]: _, ...rest } = week.plan.notes;
				week.plan.notes = rest;
			}
			await cacheWeek($state.snapshot(week));
		}
		await enqueueDayNote(edit);
		const amount = p.checklistMarks && date <= today ? checklistAmount(doc, p) : null;
		if (amount !== null && amount !== (amountOf(p.id, date) ?? 0)) await mark(p, date, amount);
		else {
			queued = await flush();
			offline = queued > 0;
		}
	}

	async function saveNote(p: PracticeView, live: NoteDoc | null) {
		const doc = live ? ($state.snapshot(live) as NoteDoc) : null;
		const edit = { practiceId: p.id, note: doc, updatedAt: new Date().toISOString() };
		if (week) {
			const wp = week.practices.find((x) => x.id === p.id);
			if (wp) {
				wp.note = doc;
				wp.noteUpdatedAt = edit.updatedAt;
			}
			await cacheWeek($state.snapshot(week));
		}
		await enqueueNote(edit);
		queued = await flush();
		offline = queued > 0;
	}

	// #18, #21: coming back from a nested screen restores the day, the open card, the week and the scroll
	const h = nav.home;
	if (h.at && h.viewDay && new Date(h.at).toDateString() === new Date().toDateString()) {
		viewDay = h.viewDay;
		expanded = h.expanded ?? null;
		if (h.start) start = h.start;
	}
	onDestroy(() => {
		nav.home = { viewDay, expanded, start, at: Date.now() };
	});

	// Spec 012 A: links to a day (?day=, Today on that day) and to a week (?start=, from the review)
	$effect(() => {
		const d = page.url.searchParams.get('day');
		const w = page.url.searchParams.get('start');
		untrack(() => {
			if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) showDay(d);
			else if (w && /^\d{4}-\d{2}-\d{2}$/.test(w) && weekStart(w) !== start) {
				start = weekStart(w);
				week = undefined;
				load(start);
			}
		});
	});

	onMount(() => {
		load().then(() => nav.restore(keyOf(page.url)));
		const refresh = () => {
			const t = todayStr();
			if (t !== today) {
				const wasCurrent = start === weekStart(today);
				today = t;
				if (wasCurrent) start = weekStart(t);
			}
			flush().then((n) => (queued = n));
			load();
			inbox.load(today);
		};
		const onVis = () => document.visibilityState === 'visible' && refresh();
		document.addEventListener('visibilitychange', onVis);
		window.addEventListener('online', refresh);
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			window.removeEventListener('online', refresh);
		};
	});

	function cellStyle(color: string) {
		const c = colorOf(color);
		return `--c-light:${c.light};--c-dark:${c.dark}`;
	}
</script>

<main onpointerdown={tab === 'today' ? swipeStart : undefined} onpointerup={tab === 'today' ? swipeEnd : undefined}>
	{#if tab === 'today'}
		<TopBar help="today" onAdd={() => capture.show()}
			title={dayName(viewDay)}
			subtitle={dayName(viewDay) !== dayTitle(viewDay) ? dayTitle(viewDay) : ''}
			subtitleLink={week && day.planned && !isFutureDay ? { text: `по плану ${day.plannedDone} из ${day.planned}`, href: '/?tab=week' } : undefined}
			below={dayNav}
			menu={[
				{ label: 'Изменить план', icon: Pencil, href: `/plan?start=${start}&from=today` },
				{ label: 'Все практики', icon: LayoutGrid, href: '/?tab=all&from=today' },
				// #30: the two zones or the screen as before
				zones
					? { label: 'Вид: прежний', icon: Rows3, onclick: () => setLayout('classic') }
					: { label: 'Вид: две зоны', icon: Rows3, onclick: () => setLayout('zones') }
			]}
		>
			{#snippet actions()}
				<button class="icon" class:on={reorder} aria-pressed={reorder} aria-label="Порядок карточек" title="Порядок" onclick={() => (reorder = !reorder)}><GripVertical size={22} /></button>
				<a class="icon" href="/settings?from=today" aria-label="Настройки" title="Настройки"><SettingsIcon size={22} /></a>
			{/snippet}
		</TopBar>
		{#if reorder}
			<div class="reorder-hint"><span>Перетаскивайте карточки за ≡</span><button onclick={() => (reorder = false)}>Готово</button></div>
		{/if}
	{:else if tab === 'week'}
		<TopBar help="week" onAdd={() => capture.show()}
			title="Неделя"
			subtitle="{label(days[0])} – {label(days[6])}"
			menu={[
				{ label: 'Итоги недели', icon: ChartNoAxesColumn, href: `/review?from=week` },
				{ label: 'Шаблоны недели', icon: Layers, href: `/plan?start=${start}&from=week&templates=1` },
				{ label: 'Новая неделя с нуля', icon: CalendarPlus, href: `/plan?start=${start}&from=week&fresh=1` },
				{ label: 'Все практики', icon: LayoutGrid, href: '/?tab=all&from=week' }
			]}
			below={weekNav}
		>
			{#snippet actions()}
				<a class="icon" href="/plan?start={start}&from=week" aria-label="Изменить план" title="Изменить план"><Pencil size={22} /></a>
				<a class="icon" href="/settings?from=week" aria-label="Настройки" title="Настройки"><SettingsIcon size={22} /></a>
			{/snippet}
		</TopBar>
		{#if week?.reviewPending && isCurrentWeek}
			<!-- Spec 010: until last week's review is opened -->
			<a class="review-banner" href="/review?from=week">Итоги прошлой недели готовы</a>
		{/if}
	{:else if tab === 'all'}
		<!-- #27: «Все практики» is no longer a tab: it opens from «⋯» and the «Цели» list, «‹» goes back -->
		<TopBar help="all" title="Все практики" back={backFrom(page.url.searchParams, 'goals')} subtitle="{label(days[0])} – {label(days[6])}" below={weekNav}>
			{#snippet actions()}
				<button
					class="icon"
					aria-label={allLens === 'goal' ? 'Группировка по целям; переключить на форматы' : 'Группировка по форматам; переключить на цели'}
					title={allLens === 'goal' ? 'Цели' : 'Форматы'}
					onclick={() => setLens(allLens === 'goal' ? 'format' : 'goal')}
					>{#if allLens === 'goal'}<Target size={22} />{:else}<Shapes size={22} />{/if}</button
				>
				<a class="icon" href="/settings?from=all" aria-label="Настройки" title="Настройки"><SettingsIcon size={22} /></a>
			{/snippet}
		</TopBar>
		<p class="lens-label">{allLens === 'goal' ? 'По целям' : 'По форматам'}</p>
		<input class="all-search" type="search" bind:value={allQuery} placeholder="Найти практику, цель, категорию" aria-label="Поиск" />
	{:else}
		<TopBar help="inbox" title="Входящие" subtitle={inbox.count ? `неразобранных: ${inbox.count}` : ''} onAdd={() => capture.show()} />
	{/if}

	{#if tab === 'inbox'}
		<InboxScreen {practices} {today} onChanged={() => load()} reviewNext={!!week?.reviewPending} />
	{:else if offline && week}
		<p class="status">{problem ?? 'Нет связи'}{queued ? ` · не отправлено: ${queued}` : ''}</p>
	{/if}

	{#if tab === 'inbox'}
		<!-- Spec 008: the inbox has its own screen above -->
	{:else if !week}
		<div class="status">
			{#if problem}
				<p>{problem}</p>
				<button class="retry" onclick={() => load()}>Повторить</button>
			{:else}
				<p>Загрузка…</p>
			{/if}
		</div>
	{:else}
		{#if (isPlan || tab === 'today') && week.plan?.status === 'draft'}
			<div class="draft">
				<p>Черновик {sourceLabel(week.plan.source)}</p>
				<div>
					<button onclick={confirmDraft} disabled={confirming}>Утвердить</button>
					<a href="/plan?start={start}">Спланировать иначе</a>
				</div>
			</div>
		{:else if (isPlan || tab === 'today') && !week.plan}
			<div class="draft">
				<p>На эту неделю плана нет</p>
				{#if start >= weekStart(today)}<div><a href="/plan?start={start}">Спланировать</a></div>{/if}
			</div>
		{/if}
		{#if tab === 'today'}
			{@render todayScreen()}
		{:else}
		<div class="grid" style="--cols:{days.length}">
			<div></div>
			{#each days as d (d)}
				{#if d >= minDay && d <= maxDay}
					<a class="day obj" class:is-today={d === today} href="/?day={d}" aria-label="Открыть {dayTitle(d)} на «Сегодня»">
						<span>{DAY_NAMES[new Date(d + 'T12:00').getDay()]}</span>
						<b>{Number(d.slice(8))}</b>
					</a>
				{:else}
					<div class="day" class:is-today={d === today}>
						<span>{DAY_NAMES[new Date(d + 'T12:00').getDay()]}</span>
						<b>{Number(d.slice(8))}</b>
					</div>
				{/if}
			{/each}

			{#each groups as g, i (g.key)}
				{#if catStart(i)}
					{@const p0 = g.practices[0]}
					{@const k = sectionOf(g)}
					{@const folded = !allQuery.trim() && foldedSections.includes(k)}
					<button class="cathead" aria-expanded={!folded} onclick={() => toggleSection(k)}>
						<svg class="chev" class:open={!folded} viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.5 7 5 3.5 8.5" /></svg>
						{#if k === 'star'}★ Рекомендованные{:else}<span class="cdot" style="--c:{colorOf(p0.color).light}"></span>{p0.categoryName}{/if}
						{#if folded}<span class="count">{groups.filter((x) => sectionOf(x) === k).length}</span>{/if}
					</button>
				{/if}
				{#if !sectionShown(g)}
					<!-- folded section -->
				{:else if g.practices.length === 1}
					{@const p = g.practices[0]}
					{@render practiceRow(p, g.title, p.title !== g.title ? p.title : '', false)}
				{:else}
					{@const isOpen = open.includes(g.key)}
					{@const n = groupDaysWithout(g, today, pausedOf)}
					<div class="name gwrap">
						<button class="name group" onclick={() => toggle(g.key)} aria-expanded={isOpen}>
							<svg class="chev" class:open={isOpen} viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.5 7 5 3.5 8.5" /></svg>
							{#if lens !== 'format'}{@render gimg(g.practices[0])}{/if}
							<span class="gtext"><span>{g.title} <span class="count">{g.practices.length}</span></span></span>
						</button>
						<!-- Spec 012 A: the name folds (its role); the line under it is the goal's link -->
						{@render goalSmall(lens !== 'format' ? g.practices[0].goalId : null, n >= 2 ? without(n) : '')}
					</div>
					{#each days as d (d)}
						{@const c = groupCell(g, d, amountOf)}
						{@const planned = g.practices.some((p) => isPlanned(p.id, d))}
						<button
							class="cell"
							class:planned
							class:blank={isPlan && !planned}
							class:bonus={isPlan && !planned && c.done > 0}
							class:future={d > today}
							class:is-today={d === today}
							data-depth={c.depth}
							style={cellStyle(c.color)}
							disabled={d > today}
							aria-label="{g.title}, {label(d)}: {isOpen ? 'свернуть' : 'раскрыть'}"
							onclick={() => toggle(g.key)}
						>{#if c.done > 1}<span class="badge">{c.done}</span>{/if}</button>
					{/each}
					{#if isOpen}
						{#each g.practices as p (p.id)}
							{@render practiceRow(p, p.title, '', true)}
						{/each}
					{/if}
				{/if}
			{/each}

			<div class="name total">День</div>
			{#each days as d (d)}
				{@const sc = isPlan ? planDayScore(practices, d, isPlanned, amountOf) : dayScore(practices, d, amountOf)}
				<div class="total" class:future={d > today} aria-label="целей: {sc.done} из {sc.total}">
					{#if d <= today && sc.total}{sc.done}/{sc.total}{:else if d <= today}–{/if}
				</div>
			{/each}
		</div>

		{#if isPlan}
			<p class="week-sum">
				По плану {summary.done} из {summary.planned}{summary.bonus ? `, бонусов ${summary.bonus}` : ''}
			</p>
		{/if}

		{#if top && isCurrentWeek}
			<p class="priority">Сегодня в приоритете: <a class="obj" href="/settings/goal/{top.id}?from={tab}"><b>{top.title}</b></a></p>
		{/if}
		{/if}
	{/if}
</main>
<QuickCapture bind:this={capture} />
{#if whenFor}
	<WhenSheet
		p={whenFor.p}
		day={whenFor.day}
		{today}
		amount={amountOf(whenFor.p.id, whenFor.day)}
		from={tab}
		onClose={() => (whenFor = null)}
		onChanged={() => load()}
	/>
{/if}
{#if flash}
	<div class="flash-wrap" aria-live="polite">
		<span class="flash"
			><a class="obj" href="/settings/goal/{flash.goalId}?from={tab}">{flash.text}</a>{#if flash.undo}<button
					class="undo"
					onclick={() => {
						flash?.undo?.();
						flash = null;
					}}>Вернуть</button
				>{/if}</span
		>
	</div>
{/if}

{#snippet dayNav()}
	<div class="weeknav">
		<button class="icon" disabled={viewDay <= minDay} onclick={() => showDay(addDays(viewDay, -1))} aria-label="Предыдущий день"><ChevronLeft size={22} /></button>
		{#if viewDay !== today}<button class="link" onclick={() => showDay(today)}>Сегодня</button>{:else}<span></span>{/if}
		<button class="icon" disabled={viewDay >= maxDay} onclick={() => showDay(addDays(viewDay, 1))} aria-label="Следующий день"><ChevronRight size={22} /></button>
	</div>
{/snippet}

{#snippet weekNav()}
	<div class="weeknav">
		<button class="icon" onclick={() => go(-1)} aria-label="Прошлая неделя"><ChevronLeft size={22} /></button>
		{#if !isCurrentWeek}<button class="link" onclick={toToday}>к текущей неделе</button>{:else}<span></span>{/if}
		<button class="icon" onclick={() => go(1)} aria-label="Следующая неделя"><ChevronRight size={22} /></button>
	</div>
{/snippet}

{#if sheet && sheetPractice}
	{@const sp = sheetPractice}
	{@const sd = sheet.date}
	{@const dayMode = sheet.mode === 'day'}
	{@const planned = isPlanned(sp.id, sd)}
	{#key `${sp.id}|${sd}|${sheet.mode}`}
		<NoteSheet
			p={sp}
			dateLabel={sd === today ? 'сегодня' : label(sd)}
			amount={amountOf(sp.id, sd)}
			doc={dayMode ? dayNoteOf(sp.id, sd) : sp.note}
			head={dayMode ? { kind: 'day', label: dayTitle(sd), day: Number(sd.slice(8)) } : { kind: 'practice' }}
			showDose={!byChecklist(sp, sd) && sd <= today}
			switchLabel={dayMode ? 'Всегда' : planned ? dayTitle(sd) : undefined}
			onSwitch={planned ? () => (sheet = { pid: sp.id, date: sd, mode: dayMode ? 'practice' : 'day' }) : undefined}
			extraLabel={planned && sd > today ? 'Убрать из плана дня' : undefined}
			onExtra={planned && sd > today ? () => setPlanned(sp, false) : undefined}
			onDose={(a) => mark(sp, sd, a)}
			onNote={(doc) => (dayMode ? saveDayNote(sp, sd, doc) : saveNote(sp, doc))}
			onClose={() => (sheet = undefined)}
		/>
	{/key}
{/if}

{#if deedSheet}
	{@const ds = deedSheet}
	<DeedSheet
		step={ds}
		practices={(week?.practices ?? []).filter((x) => x.goalId === ds.goalId)}
		onSave={saveDeed}
		onRemove={removeDeed}
		onDone={() => {
			deedSheetId = null;
			stepDone(ds);
		}}
		onClose={closeDeed}
	/>
{/if}

{#snippet todayScreen()}
	{#if zones && viewDay >= today}
		{@render deedsZone()}
	{/if}
	{#if !zones && viewDay >= today && goalStepsToday.length}
		<!-- #28: steps of goals in focus, or with their day come — at most three, the rest behind «ещё N» -->
		<section class="steps-today">
			<h2 class="zone">Дела</h2>
			<ul>
				{#each stepsShowAll ? goalStepsToday : goalStepsToday.slice(0, appNum('today.steps_rows')) as st (st.id)}
					<li>
						<input type="checkbox" aria-label="Шаг сделан: {st.title}" onchange={(e) => { e.currentTarget.checked = false; stepDone(st); }} />
						<button class="sttl" onclick={() => (deedSheetId = st.id)}>{st.title}</button>
						<a class="obj sgoal" href="/settings/goal/{st.goalId}?from={tab}">{st.goalTitle}</a>
						{#if st.note && !isEmptyNote(st.note)}
							<div class="dnote classic"><NoteView doc={st.note} onToggle={(i) => toggleDeedTask(st, i)} onOpen={() => {}} /></div>
						{/if}
					</li>
				{/each}
			</ul>
			{#if !stepsShowAll && goalStepsToday.length > appNum('today.steps_rows')}<button class="more-btn2" onclick={() => (stepsShowAll = true)}>ещё {goalStepsToday.length - appNum('today.steps_rows')}</button>{/if}
		</section>
	{/if}
	{#if viewDay === today && dueCheck}
		<!-- Spec 009 E: one milestone at a time whose date has come -->
		{#key dueCheck.id}
			<div class="due-card"><MilestoneCheck m={dueCheck} {today} onToday onChanged={() => load()} /></div>
		{/key}
	{/if}
	{#if day.planned}
		{#if viewDay === today}
			<p class="priority today-top">
				{#if day.top}В приоритете: <a class="obj" href="/settings/goal/{day.topGoalId}?from={tab}"><b>{day.top}</b></a>{:else}План на сегодня выполнен{/if}
			</p>
		{:else if isFutureDay}
			<p class="day-hint">Отмечать можно, когда день наступит. Заметку дня можно писать уже сейчас.</p>
		{/if}
	{:else}
		<p class="empty-day">На {viewDay === today ? 'сегодня' : 'этот день'} ничего не запланировано</p>
	{/if}

	{#if zones}
		{#if skillsTodo.length || skillsDone.length}
			<!-- #30: skills — practices of goals of growth, with the cube of the day -->
			<h2 class="zone">Навыки · {skillsDone.filter((d) => !d.bonus).length} из {skillsPlanned}</h2>
			{#if skillsTodo.length}
				<ul class="cards" class:reorder bind:this={listEls.todo}>
					{#each inOrder('todo', skillsTodo, (p) => p.id) as p (p.id)}
						<li data-id={p.id} class:dragging={drag?.id === p.id} in:receive={{ key: p.id }} out:send={{ key: p.id }} animate:flip={{ duration: 180 }}>
							{@render card(p, false, 'todo', skillsTodo.map((x) => x.id))}
						</li>
					{/each}
				</ul>
			{/if}
			{#if skillsDone.length}
				<ul class="cards done-skills" class:reorder bind:this={listEls.done}>
					{#each inOrder('done', skillsDone, (d) => d.p.id) as d (d.p.id)}
						<li data-id={d.p.id} class:dragging={drag?.id === d.p.id} in:receive={{ key: d.p.id }} out:send={{ key: d.p.id }} animate:flip={{ duration: 180 }}>
							{@render card(d.p, d.bonus, 'done', skillsDone.map((x) => x.p.id))}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}

	{#if !zones && day.todo.length}
		<h2 class="zone">К выполнению</h2>
		<ul class="cards" class:reorder bind:this={listEls.todo}>
			{#each inOrder('todo', day.todo, (p) => p.id) as p (p.id)}
				<li data-id={p.id} class:dragging={drag?.id === p.id} in:receive={{ key: p.id }} out:send={{ key: p.id }} animate:flip={{ duration: 180 }}>
					{@render card(p, false, 'todo', day.todo.map((x) => x.id))}
				</li>
			{/each}
		</ul>
	{/if}

	{#if !zones && day.done.length}
		<h2 class="zone">Сделано</h2>
		<ul class="cards" class:reorder bind:this={listEls.done}>
			{#each inOrder('done', day.done, (d) => d.p.id) as d (d.p.id)}
				<li data-id={d.p.id} class:dragging={drag?.id === d.p.id} in:receive={{ key: d.p.id }} out:send={{ key: d.p.id }} animate:flip={{ duration: 180 }}>
					{@render card(d.p, d.bonus, 'done', day.done.map((x) => x.p.id))}
				</li>
			{/each}
		</ul>
	{/if}

	{#if isFutureDay && day.other.length}
		<details class="more" open={!day.planned}>
			<summary>Добавить в план этого дня <span class="count">{day.other.length}</span></summary>
			<!-- #25: the same navigator, «pick one»: a tap plans the practice on this day -->
			<PracticeTree tree={treeOfPractices(day.other)} storageKey="today-add-tree" mode="one" search={day.other.length > 6} onPick={(p) => setPlanned(p, true)} />
		</details>
	{:else if day.other.length}
		<details class="more" open={moreOpen || !day.planned} ontoggle={(e) => (moreOpen = (e.currentTarget as HTMLDetailsElement).open)}>
			<summary>Сделать что-то ещё <span class="count">{otherCount(day.other)}</span></summary>
			<!-- #12: recommended on top as a flat list (they can be reordered); the rest as the settings tree -->
			{#if recommended.length}
				<h3 class="sub-title">Рекомендованные</h3>
				<ul class="cards" class:reorder bind:this={listEls.other}>
					{#each inOrder('other', recommended, (p) => p.id) as p (p.id)}
						<li data-id={p.id} class:dragging={drag?.id === p.id} in:receive={{ key: p.id }} out:send={{ key: p.id }} animate:flip={{ duration: 180 }}>
							{@render card(p, false, 'other', recommended.map((x) => x.id))}
						</li>
					{/each}
				</ul>
			{/if}
			{#if otherTree.length}
				<div class="other-tree">
					<PracticeTree
						tree={otherTree}
						storageKey="today-tree-collapsed"
						search={day.other.length > 6}
						chips={[
							{ key: 'week', label: 'В плане недели', keep: (p) => days.some((d) => isPlanned(p.id, d)) },
							...(week?.plan?.focus?.length ? [{ key: 'focus', label: 'В фокусе', keep: (p: PracticeView) => !!week?.plan?.focus?.includes(p.goalId) }] : [])
						]}
					>
						{#snippet goalExtra(g)}
							<!-- Spec 009 B in the tree: the goal line sits on the goal's heading, once for its cards -->
							{@render mline(g.id, '')}
						{/snippet}
						{#snippet practice(p)}
							{@render card(p, false, 'tree', [])}
						{/snippet}
					</PracticeTree>
				</div>
			{/if}
		</details>
	{/if}

{/snippet}

{#snippet deedsZone()}
	{@const limit = appNum('today.deeds_rows')}
	{@const rows = deedsAll ? deedRows : deedRows.slice(0, limit)}
	<!-- #30: deeds — one-off deeds of any goal or sphere, the «сначала» step of a practice of the day, the sphere practices -->
	<section class="deeds">
		<h2 class="zone">Дела · {deedRows.length}</h2>
		{#if deedRows.length || deedsDone.length}
			<ul>
				{#each rows as r (r.kind === 'area' ? `p${r.p.id}` : `s${r.st.id}`)}
					<li>
						{#if r.kind === 'area'}
							{@const dn = dayNoteOf(r.p.id, viewDay)}
							{@const pn = dn && !isEmptyNote(dn) ? null : r.p.note}
							{@const nstats = checklistStats(dn ?? pn)}
							<button class="round" aria-label="Сделано: {r.p.title}" onclick={() => areaDone(r.p)}></button>
							<button class="dt" aria-expanded={deedOpen === `p${r.p.id}`} onclick={() => toggleDeedRow(`p${r.p.id}`)}>{r.p.title}{#if nstats.total}<span class="dcount">{nstats.checked} из {nstats.total}</span>{/if}</button>
							<a class="obj dw" href="/settings/goal/{r.p.goalId}?from={tab}">{r.p.goalTitle}</a>
							<!-- the same as a skill's card: closed — the note's first block (the day note whole with «Показывать
							     заметку дня целиком»); open — the day note and the «Всегда» note whole, with the boxes, and the icons -->
							{@const open = deedOpen === `p${r.p.id}`}
							{@const dayNote = dn && !isEmptyNote(dn) ? dn : null}
							{@const showDay = !!dayNote && (r.p.showNoteFull || open)}
							{@const first = showDay || open ? null : dayNote ? firstBlockDoc(dayNote) : firstBlockDoc(r.p.note)}
							{#if first}{@render notePreview(first, `p${r.p.id}`)}{/if}
							{#if showDay && dayNote}
								<div class="dnote">
									<NoteHead kind="day" label={dayTitle(viewDay)} day={Number(viewDay.slice(8))} />
									<NoteView doc={dayNote} onToggle={(i) => saveDayNote(r.p, viewDay, toggleTask(dayNote, i))} onOpen={() => {}} />
								</div>
							{/if}
							{#if open && r.p.note && !isEmptyNote(r.p.note)}
								{@const pnote = r.p.note}
								<div class="dnote">
									<NoteHead kind="practice" />
									<NoteView doc={pnote} onToggle={(i) => saveNote(r.p, toggleTask(pnote, i))} onOpen={() => {}} />
								</div>
							{/if}
							{#if deedOpen === `p${r.p.id}`}<div class="dtools">{@render practiceTools(r.p)}</div>{/if}
						{:else}
							{@const stats = checklistStats(r.st.note)}
							<button class="round" aria-label="Сделано: {r.st.title}" onclick={() => stepDone(r.st)}></button>
							<button class="dt" aria-expanded={deedOpen === `s${r.st.id}`} onclick={() => toggleDeedRow(`s${r.st.id}`)}>{r.st.title}{#if stats.total}<span class="dcount">{stats.checked} из {stats.total}</span>{/if}</button>
							{#if r.kind === 'first'}
								<span class="dw">сначала · <a class="obj" href="/settings/practice/{r.p.id}?from={tab}">{r.p.title}</a></span>
							{:else}
								<a class="obj dw" href="/settings/goal/{r.st.goalId}?from={tab}"
									>{r.st.goalTitle}{#if r.st.dueDate} · до {dayTitle(r.st.dueDate).toLowerCase()}{/if}</a
								>
							{/if}
							<!-- as a skill's card: closed — the description's first block, or all of it with «Показывать описание целиком»;
							     open — all of it, the boxes ticked here, and the icons -->
							{@const sopen = deedOpen === `s${r.st.id}`}
							{#if r.st.note && !isEmptyNote(r.st.note)}
								{#if sopen || r.st.showNoteFull}
									{@const snote = r.st.note}
									<div class="dnote"><NoteView doc={snote} onToggle={(i) => toggleDeedTask(r.st, i)} onOpen={() => {}} /></div>
								{:else}
									{@const f = firstBlockDoc(r.st.note)}
									{#if f}{@render notePreview(f, `s${r.st.id}`)}{/if}
								{/if}
							{/if}
							{#if deedOpen === `s${r.st.id}`}{@render deedTools(r.st)}{/if}
						{/if}
					</li>
				{/each}
			</ul>
			{#if !deedsAll && deedRows.length > limit}<button class="more-btn2" onclick={() => (deedsAll = true)}>ещё {deedRows.length - limit}</button>{/if}
		{/if}
		<form class="add-deed" onsubmit={addDeed}>
			<input bind:value={deedTitle} placeholder="+ дело" aria-label="Новое дело" enterkeyhint="done" />
			<button type="button" class="dgoal" onclick={() => (pickingGoal = true)}>{deedGoal ? deedGoal.title : 'куда?'}</button>
		</form>
		{#if deedsDone.length}
			<p class="dsub">Сделано</p>
			<ul class="ddone">
				{#each deedsDone as d (d.id)}
					<li><span class="dt">{d.title}</span><span class="dw">{d.where}</span></li>
				{/each}
			</ul>
		{/if}
	</section>
	{#if pickingGoal}
		<div class="backdrop" role="presentation" onclick={() => (pickingGoal = false)}></div>
		<div class="sheet" role="dialog" aria-label="Куда дело">
			<header><span class="st">Куда дело — сфера или цель</span><button class="done" onclick={() => (pickingGoal = false)}>Готово</button></header>
			<div class="sbody"><PracticeTree tree={goalTree} storageKey="deed-goal-tree" mode="goal" onPickGoal={(g) => pickDeedGoal(g)} /></div>
		</div>
	{/if}
{/snippet}

{#snippet card(p: PracticeView, bonus: boolean, list: ListName, ids: number[])}
	{@const planned = isPlanned(p.id, viewDay)}
	{@const dayNote = planned ? dayNoteOf(p.id, viewDay) : null}
	{@const a = amountOf(p.id, viewDay)}
	{@const dep = depth(a, p)}
	{@const auto = byChecklist(p, viewDay)}
	{@const st = checklistStats(dayNote)}
	{@const isOpen = expanded === p.id}
	{@const showDay = !!dayNote && (p.showNoteFull || isOpen)}
	{@const first = showDay || isOpen ? null : firstLine(dayNote) ? firstBlockDoc(dayNote) : firstBlockDoc(p.note)}
	<div class="card-wrap" data-depth={dep}>
		<!-- Spec 007 F: the box is the only mark; a tap anywhere else opens the card in place.
		     Keyboard and screen readers use the header button (.chead); the click on the whole card
		     only widens the touch target. -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
		<div
			class="card"
			class:stripe={zones}
			class:nobox={auto}
			class:has-star={list === 'other' || list === 'tree'}
			class:open={isOpen}
			data-depth={dep}
			style={cellStyle(p.color)}
			role="group"
			aria-label={p.title}
			onclick={(e) => {
				// a link (goal line, flag) and the opened part handle their own taps; links must reach the
				// router, so they are not stopped — a stopped click becomes a full page load (#21)
				if ((e.target as Element).closest('a, .cexpand, .cstep')) return;
				toggleCard(p.id);
			}}
		>
			{#if zones && !auto}
				<!-- #30: the cube of the day — empty, half (minimum), full (norm); a tap is the box's old logic (Spec 007 F) -->
				<button
					class="cube"
					disabled={isFutureDay}
					aria-pressed={counts(a, p)}
					aria-label="{p.title}: {counts(a, p) ? 'снять отметку' : 'отметить норму'}"
					onclick={(e) => {
						e.stopPropagation();
						mark(p, viewDay, counts(a, p) ? 0 : p.normDose);
					}}
					><svg viewBox="0 0 28 28" aria-hidden="true"
						><rect class="cube-frame" x="2" y="2" width="24" height="24" rx="6" /><rect
							class="cube-fill"
							x="4"
							width="20"
							rx="4"
							style:y="{dep >= 1 ? 4 : dep > 0 ? 14 : 24}px"
							style:height="{dep >= 1 ? 20 : dep > 0 ? 10 : 0}px"
						/></svg
					></button
				>
			{:else if !auto}
				<button
					class="box box-btn"
					disabled={isFutureDay}
					aria-pressed={counts(a, p)}
					aria-label="{p.title}: {counts(a, p) ? 'снять отметку' : 'отметить норму'}"
					onclick={(e) => {
						e.stopPropagation();
						mark(p, viewDay, counts(a, p) ? 0 : p.normDose);
					}}>{#if counts(a, p)}<svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6 9.6 3.4" /></svg>{/if}</button
				>
			{/if}
			<div class="chead-col">
			<button
				class="chead"
				aria-expanded={isOpen}
				aria-label="{p.title}{bonus ? ', бонус' : ''}: {isOpen ? 'свернуть' : 'раскрыть'}"
				onclick={(e) => {
					e.stopPropagation();
					toggleCard(p.id);
				}}
			>
				<span class="ctitle">{p.title}{#if bonus}<span class="tag">бонус</span>{/if}</span>
			</button>
			{#if week?.volumes?.[p.id]}{@render vline(p)}{:else if list !== 'tree'}{@render mline(p.goalId, p.goalTitle !== p.title ? p.goalTitle : '')}{/if}
			</div>
			{#if list === 'other' || list === 'tree'}{@render star(p)}{/if}
			<span class="dose" class:count={auto}
				>{auto ? `${st.checked} из ${st.total}` : a && !counts(a, p) ? `${a} из ${p.normDose} ${p.unit}` : a ? `${a} ${p.unit}` : volCaption(p) || doseHint(p)}</span
			>
			{#if planned && stepOf(p) && !zones}
				{@const st0 = stepOf(p)!}
				{@const more = stepsOfPractice(p.id).length - 1}
				<!-- #28: a step of this practice — a precondition, first line on the card; it does not block the mark -->
				<div class="cstep">
					<input type="checkbox" aria-label="Дело сделано: {st0.title}" onchange={(e) => { e.currentTarget.checked = false; stepDone(st0); }} />
					<span class="first">сначала</span><span class="sttl">{st0.title}</span>
					{#if more > 0}<a class="obj more-steps" href="/settings/goal/{p.goalId}?from={tab}">и ещё {more}</a>{/if}
				</div>
			{/if}
			{#if first}
				<!-- task 13: the note's first block, whole and formatted; links work, the rest of a tap opens the card -->
				<div class="cnote cline"><NoteView doc={first} preview /></div>
			{/if}
			{#if showDay && dayNote}
				<div class="cnote">
					<NoteHead kind="day" label={dayTitle(viewDay)} day={Number(viewDay.slice(8))} />
					<NoteView doc={dayNote} readonly={isFutureDay} onToggle={(i) => saveDayNote(p, viewDay, toggleTask(dayNote, i))} onOpen={() => {}} />
				</div>
			{/if}
			{#if isOpen}
				<div class="cnote cexpand">
					{#if p.note}
						<NoteHead kind="practice" />
						<NoteView doc={p.note} onToggle={(i) => saveNote(p, toggleTask(p.note!, i))} onOpen={() => toggleCard(p.id)} />
					{/if}
					{#if !auto && !isFutureDay}
						<div class="dose-row">
							<button onclick={() => mark(p, viewDay, p.minDose)}>Мин · {p.minDose}</button>
							<button onclick={() => mark(p, viewDay, p.normDose)}>Норма · {p.normDose}</button>
						</div>
						{#if week?.volumes?.[p.id]}{@render volumeRow(p)}{/if}
						<form class="vol-form" onsubmit={(e) => { e.preventDefault(); addStep(p, e.currentTarget); }}>
							<input name="step" placeholder="+ Дело для «{p.title}»" aria-label="Новое дело практики" />
						</form>
					{/if}
					{@render practiceTools(p)}
				</div>
			{/if}
		</div>
		{@render sideButton(p, list, ids, `${p.title}: ${planned ? 'план дня и заметка' : 'доза и заметка'}`, () => openSheet(p, viewDay))}
	</div>
{/snippet}

{#snippet notePreview(doc: NoteDoc, key: string)}
	<!-- a closed row's note: one block, read only; a tap opens the row (links still work) -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="dnote cline" onclick={(e) => { if (!(e.target as HTMLElement).closest('a')) toggleDeedRow(key); }}><NoteView {doc} preview /></div>
{/snippet}

{#snippet deedTools(st: StepView)}
	<!-- a deed's icon row: the same look as a practice's, only what a deed has -->
	<div class="dtools">
		{#if deedWhen === st.id}
			<div class="dwhen">
				<button onclick={() => planDeed(st, addDays(today, 1))}>На завтра</button>
				<label>День <input type="date" value={st.plannedDate ?? ''} onchange={(e) => planDeed(st, e.currentTarget.value || null)} /></label>
				{#if st.plannedDate}<button onclick={() => planDeed(st, null)}>Без дня</button>{/if}
			</div>
		{/if}
		<div class="actions few" role="toolbar" aria-label="{st.title}: действия">
			<button
				class:dim={!st.note || (isEmptyNote(st.note) && !checklistStats(st.note).total)}
				aria-label="Описание дела «{st.title}»"
				title="Описание и подзадачи"
				onclick={() => (deedSheetId = st.id)}><FilePen size={22} /></button
			>
			<button
				class:on={deedWhen === st.id}
				aria-label="Когда: {st.title}"
				aria-expanded={deedWhen === st.id}
				title="Когда"
				onclick={() => (deedWhen = deedWhen === st.id ? null : st.id)}><CalendarArrowRight size={22} /></button
			>
			<a class="flag-btn" href="/settings/goal/{st.goalId}?from={tab}" aria-label="Цель «{st.goalTitle}»" title="Цель"><Flag size={22} /></a>
			<button aria-label="Дело «{st.title}»: все поля" title="Дело" onclick={() => (deedSheetId = st.id)}><SlidersHorizontal size={22} /></button>
		</div>
	</div>
{/snippet}

{#snippet practiceTools(p: PracticeView)}
	<!-- the icon row of a practice — a skill's card and a sphere's row in «Дела» -->
	{@const planned = isPlanned(p.id, viewDay)}
	{@const dayNote = planned ? dayNoteOf(p.id, viewDay) : null}
	{@const a = amountOf(p.id, viewDay)}
	{@const auto = byChecklist(p, viewDay)}
	{#if !auto && !isFutureDay}
	{#if qtyOpen === p.id}
		<form
			class="qty"
			onsubmit={(e) => {
				e.preventDefault();
				const v = Number(String(new FormData(e.currentTarget).get('q') ?? '').replace(',', '.'));
				if (Number.isFinite(v) && v >= 0) {
					mark(p, viewDay, v);
					qtyOpen = undefined;
				}
			}}
		>
			<!-- svelte-ignore a11y_autofocus -->
			<input name="q" inputmode="decimal" placeholder="Количество, {p.unit}" aria-label="Количество, {p.unit}" value={a ?? ''} autofocus />
			<button type="submit" aria-label="Записать количество">✓</button>
		</form>
	{/if}
	{/if}
<!-- task 13: one row of icons; new actions are added here as more buttons -->
<div class="actions" role="toolbar" aria-label="{p.title}: действия">
	<button
		class:dim={!p.note}
		aria-label="Заметка «Всегда»: {p.note ? 'изменить' : 'создать'}"
		title="Заметка «Всегда»"
		onclick={() => openSheet(p, viewDay, 'practice')}><FilePen size={22} /></button
	>
	{#if planned}
		<button
			class:dim={!dayNote}
			aria-label="Заметка дня, {dayTitle(viewDay)}: {dayNote ? 'изменить' : 'создать'}"
			title="Заметка дня, {dayTitle(viewDay)}"
			onclick={() => openSheet(p, viewDay, 'day')}><DayIcon day={Number(viewDay.slice(8))} /></button
		>
	{/if}
	<button
		aria-label="Когда: {p.title}"
		title="Когда"
		onclick={() => (whenFor = { p, day: viewDay })}><CalendarArrowRight size={22} /></button
	>
	{@render star(p)}
	<button
		class="link-btn"
		class:on={p.inLinks}
		aria-pressed={!!p.inLinks}
		aria-label="{p.title}: {p.inLinks ? 'убрать из «Ссылок»' : 'в «Ссылки»'}"
		title={p.inLinks ? 'В «Ссылках»' : 'В «Ссылки»'}
		onclick={() => toggleInLinks(p)}><LinkIcon size={20} strokeWidth={p.inLinks ? 2.6 : 2} /></button
	>
	<a
		class="flag-btn"
		class:dim={!week?.milestones?.[p.goalId]}
		href="/settings/goal/{p.goalId}?from={tab}"
		aria-label="Цель «{p.goalTitle}»: майлстон и прогресс"
		title="Майлстон"><Flag size={22} /></a
	>
	<a
		class="flag-btn"
		href="/settings/practice/{p.id}?from={tab}"
		aria-label="Настройки практики «{p.title}»"
		title="Настройки практики"><SlidersHorizontal size={22} /></a
	>
	{#if !auto && !isFutureDay}
		<button
			class="qty-btn"
			class:on={qtyOpen === p.id}
			aria-label="Своё количество, {p.unit}"
			aria-expanded={qtyOpen === p.id}
			title="Своё количество"
			onclick={() => (qtyOpen = qtyOpen === p.id ? undefined : p.id)}>±</button
		>
	{/if}
</div>
{/snippet}

{#snippet vline(p: PracticeView)}
	<!-- #24: a finite practice — where you are and how much is left; the thin bar under the words is the progress -->
	{@const v = week!.volumes![p.id]}
	{@const pos = volPos(p)}
	<span class="vbar" style="--vp:{Math.min(100, (pos / v.total) * 100)}%" role="img" aria-label="{fmtN(pos)} из {fmtN(v.total)} {p.unit}"></span>
{/snippet}

{#snippet mline(goalId: number, goalTitle: string)}
	<!-- Spec 009 B: «goal · flag time left» under the title; a tap opens the goal screen, not the card -->
	{@const m = week?.milestones?.[goalId]}
	<a class="mline" href="/settings/goal/{goalId}?from={tab}"
		>{#if goalTitle}<span class="mgoal">{goalTitle}</span>{/if}{#if m}{#if goalTitle}<span class="sep">·</span>{/if}<Flag size={11} /><span
				>{remaining(m.dueDate, today) || 'без срока'}</span
			>{:else}{#if goalTitle}<span class="sep">·</span>{/if}<span class="none">нет майлстона</span>{/if}</a
	>
{/snippet}

{#snippet gimg(p: PracticeView)}
	<!-- Spec 013 A: the goal's picture as a small label in goal rows -->
	<span class="gimg"><GoalImage kind={p.goalImageKind ?? 'text'} value={p.goalImageValue ?? ''} color={p.color} title={p.goalTitle} size={18} /></span>
{/snippet}

{#snippet goalSmall(goalId: number | null, text: string)}
	<!-- Spec 009 B: the same milestone line in goal headings of «Неделя» and «Всё» -->
	{@const m = goalId === null ? undefined : week?.milestones?.[goalId]}
	{#if goalId !== null && (text || m)}
		<a class="obj gsmall" href="/settings/goal/{goalId}?from={tab}"
			>{text}{#if m}{#if text}<span> · </span>{/if}<Flag size={10} />{remaining(m.dueDate, today) || 'без срока'}{/if}</a
		>
	{:else if text}
		<small class="gsmall">{text}</small>
	{/if}
{/snippet}

{#snippet volumeRow(p: PracticeView)}
	{@const v = week!.volumes![p.id]}
	{#if v.doneOn}
		<!-- #24: the volume is gone through — the next one, or the practice is over -->
		{#if nextFor === p.id}
			<form class="vol-form" onsubmit={(e) => { e.preventDefault(); volumeNext(p, e.currentTarget); }}>
				<input name="title" placeholder="Название (необязательно)" aria-label="Название" />
				<input name="total" inputmode="decimal" placeholder="Объём, {p.unit}" aria-label="Объём, {p.unit}" required />
				<button type="submit">Начать</button>
			</form>
		{:else}
			<div class="dose-row">
				<button onclick={() => (nextFor = p.id)}>Следующая книга</button>
				<button onclick={() => volumeEnd(p)}>Закончить практику</button>
			</div>
		{/if}
	{:else}
		<form class="vol-form" onsubmit={(e) => { e.preventDefault(); volumeAt(p, e.currentTarget); }}>
			<label>Я на {p.unit}<input name="at" inputmode="decimal" placeholder={fmtN(volPos(p))} aria-label="Текущая позиция, {p.unit}" /></label>
			<button type="submit" aria-label="Записать позицию">✓</button>
		</form>
	{/if}
{/snippet}

{#snippet star(p: PracticeView)}
	<button
		class="star"
		class:on={p.recommended}
		aria-pressed={p.recommended}
		aria-label="{p.title}: {p.recommended ? 'не рекомендовать' : 'рекомендовать'}"
		title={p.recommended ? 'Рекомендовано' : 'Рекомендовать'}
		onclick={(e) => {
			e.stopPropagation();
			toggleRecommended(p);
		}}><Star size={20} fill={p.recommended ? 'currentColor' : 'none'} /></button
	>
{/snippet}

{#snippet sideButton(p: PracticeView, list: ListName, ids: number[], label: string, open: () => void)}
	{#if reorder && list !== 'tree'}
		<button
			class="more-btn handle"
			aria-label="{p.title}: перетащить"
			onpointerdown={(e) => dragStart(e, list, p.id, ids)}
			onpointermove={dragMove}
			onpointerup={dragEnd}
			onpointercancel={dragEnd}><GripVertical size={22} /></button
		>
	{:else}
		<button class="more-btn" aria-label={label} title="Заметка и доза" onclick={open}><Ellipsis size={20} /></button>
	{/if}
{/snippet}

{#snippet practiceRow(p: PracticeView, title: string, sub: string, indent: boolean)}
	{@const n = nOf(p)}
	<!-- Spec 012 A: a practice's name opens its screen; dose and note — a long press on a cell -->
	<div class="name prow" class:indent>
		<a class="obj pname" href="/settings/practice/{p.id}?from={tab}">{#if lens !== 'format' && !indent}{@render gimg(p)}{/if}{title}</a>
		{@render goalSmall(lens !== 'format' && !indent ? p.goalId : null, [sub, n >= 2 ? without(n) : ''].filter(Boolean).join(' · '))}
	</div>
	{#each days as d (d)}
		{@const a = amountOf(p.id, d)}
		{@const planned = isPlanned(p.id, d)}
		<button
			class="cell"
			class:planned
			class:blank={isPlan && !planned}
			class:bonus={isPlan && !planned && counts(a, p)}
			class:future={d > today}
			class:is-today={d === today}
			data-depth={depth(a, p)}
			style={cellStyle(p.color)}
			disabled={d > today}
			aria-label="{p.title}, {label(d)}: {a ? `${a} ${p.unit}` : 'нет'}"
			onpointerdown={() => down(p, d)}
			onpointerup={() => tap(p, d)}
			onpointerleave={cancel}
			onpointercancel={cancel}
			oncontextmenu={(e) => e.preventDefault()}
		></button>
	{/each}
{/snippet}

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 12px calc(env(safe-area-inset-bottom) + 84px);
	}
	.retry {
		min-height: 44px;
		padding: 0 20px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
		cursor: pointer;
	}
	.status {
		text-align: center;
		color: var(--muted);
		font-size: 13px;
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(118px, 2.1fr) repeat(var(--cols), minmax(0, 1fr));
		gap: 6px;
		align-items: center;
	}
	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: 12px;
		color: var(--muted);
		padding: 4px 0;
		border-radius: 8px;
	}
	.day b {
		font-size: 15px;
		color: var(--text);
	}
	.day.is-today {
		background: var(--today);
		color: var(--bg);
	}
	.day.is-today b {
		color: var(--bg);
	}
	.name {
		display: flex;
		flex-direction: column;
		font-size: 14px;
		line-height: 1.2;
		hyphens: auto;
		-webkit-hyphens: auto;
	}
	.name small {
		color: var(--muted);
		font-size: 12px;
	}
	.cell {
		--c: var(--c-light);
		aspect-ratio: 1;
		width: 100%;
		border-radius: 8px;
		border: 1.5px dashed var(--line);
		background: transparent;
		padding: 0;
		cursor: pointer;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		transition: background-color 0.12s;
	}
	@media (prefers-color-scheme: dark) {
		.cell {
			--c: var(--c-dark);
		}
	}
	.cell.is-today {
		border-color: var(--muted);
	}
	.cell[data-depth='0.5'] {
		border: 1.5px solid transparent;
		background: color-mix(in oklab, var(--c) var(--half), var(--surface));
	}
	.cell[data-depth='1'] {
		border: 1.5px solid transparent;
		background: var(--c);
	}
	/* Above norm: deepest shade, plus a dot so it reads the same in both themes. */
	.cell[data-depth='1.5'] {
		border: 1.5px solid transparent;
		background:
			radial-gradient(circle, var(--surface) 0 3px, transparent 3.5px),
			color-mix(in oklab, var(--c), var(--plus-mix));
	}
	.cell.future {
		border: 1.5px solid transparent;
		background: color-mix(in oklab, var(--line) 35%, transparent);
		cursor: default;
	}
	.total {
		text-align: center;
		font-size: 12px;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.name.total {
		text-align: left;
		font-size: 14px;
	}
	.priority {
		margin-top: 20px;
		padding: 12px 14px;
		background: var(--surface);
		border-radius: 12px;
		font-size: 15px;
	}
	button.name {
		background: none;
		border: none;
		padding: 0;
		text-align: left;
		cursor: pointer;
		font: inherit;
		font-size: 14px;
		min-height: 44px;
		justify-content: center;
	}
	button.name.group {
		flex-direction: row;
		align-items: center;
		justify-content: flex-start;
		gap: 4px;
		width: 100%;
		min-width: 0;
		color: var(--text);
	}
	.gtext {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.cathead {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		margin-top: 6px;
		padding: 0;
		border: none;
		background: none;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.cdot {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		background: var(--c);
	}
	.all-search {
		width: 100%;
		box-sizing: border-box;
		min-height: 40px;
		margin: 0 0 8px;
		padding: 0 12px;
		border: none;
		border-radius: 10px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 16px;
	}
	.gimg {
		display: inline-flex;
		margin-right: 5px;
		vertical-align: -4px;
	}
	.gwrap {
		min-width: 0;
	}
	.gwrap button.name.group {
		min-height: 30px;
	}
	.gwrap .gsmall,
	.prow .gsmall {
		color: var(--muted);
		font-size: 12px;
	}
	.gwrap .gsmall {
		padding-left: 14px;
	}
	.prow {
		min-height: 44px;
		justify-content: center;
		min-width: 0;
	}
	.prow .pname {
		color: var(--text);
		min-height: 24px;
		display: flex;
		align-items: center;
	}
	a.day {
		text-decoration: none;
	}
	.chev {
		flex: none;
		width: 10px;
		height: 10px;
		fill: none;
		stroke: var(--muted);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		transform-origin: 50% 50%;
		transition: transform 0.15s;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.count {
		color: var(--muted);
		font-size: 12px;
	}
	.name.indent {
		padding-left: 14px;
		font-size: 13px;
	}
	.cell {
		position: relative;
	}
	.badge {
		position: absolute;
		top: 2px;
		right: 3px;
		font-size: 10px;
		font-weight: 700;
		line-height: 1;
		color: var(--surface);
		font-variant-numeric: tabular-nums;
	}
	.cell[data-depth='0.5'] .badge {
		color: var(--text);
	}
	/* Spec 003: outline = plan, fill = fact; no plan in the plan view = empty space. */
	.cell.planned {
		border: 2px solid var(--c);
	}
	.cell.blank[data-depth='0'] {
		border-color: transparent;
		background: transparent;
	}
	.cell.blank.future {
		background: transparent;
	}
	.cell.bonus::after {
		content: '+';
		position: absolute;
		top: 1px;
		left: 4px;
		font-size: 11px;
		font-weight: 700;
		line-height: 1;
		color: var(--surface);
	}
	.cell.bonus[data-depth='0.5']::after {
		color: var(--text);
	}
	.draft {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
		margin: 0 0 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--surface);
		font-size: 14px;
	}
	.draft p {
		margin: 0;
	}
	.draft div {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.draft button,
	.draft a {
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		padding: 0 12px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--bg);
		color: var(--text);
		text-decoration: none;
		font-size: 14px;
		cursor: pointer;
	}
	.week-sum {
		margin: 12px 0 0;
		font-size: 13px;
		color: var(--muted);
		text-align: center;
	}
	.dose.count {
		white-space: nowrap;
		font-size: 14px;
		font-weight: 600;
	}
	main {
		touch-action: pan-y;
	}
	.day-hint {
		color: var(--muted);
		font-size: 14px;
		margin: 0 0 8px;
	}
	.today-top {
		margin-top: 0;
	}
	.empty-day {
		text-align: center;
		color: var(--muted);
		margin: 24px 0 8px;
	}
	.zone {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 20px 0 8px;
	}
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	/* header row: box · title · dose (· room for ⋯); the note runs full width below (#9) */
	.card {
		--c: var(--c-light);
		--fg: var(--text);
		width: 100%;
		box-sizing: border-box;
		min-height: 60px;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(0, 36%);
		align-items: center;
		column-gap: 12px;
		padding: 10px 14px;
		border-radius: 14px;
		border: 2px solid var(--c);
		background: var(--surface);
		color: var(--fg);
		text-align: left;
		cursor: pointer;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		transition: background-color 0.15s;
	}
	@media (prefers-color-scheme: dark) {
		.card {
			--c: var(--c-dark);
		}
	}
	/* done: fill by depth (v0.1 rules); white text on the full shades */
	.card[data-depth='0.5'] {
		background: color-mix(in oklab, var(--c) var(--half), var(--surface));
	}
	/* full shades use the deeper palette tone in both themes, so white text stays readable */
	.card[data-depth='1'] {
		background: color-mix(in oklab, var(--c-light) 78%, black);
		border-color: transparent;
		--fg: #fff;
	}
	.card[data-depth='1.5'] {
		background: color-mix(in oklab, var(--c-light) 58%, black);
		border-color: transparent;
		--fg: #fff;
	}
	.box {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		border: 2px solid var(--c);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.card[data-depth='1'] .box,
	.card[data-depth='1.5'] .box {
		border-color: #fff;
	}
	.box svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: var(--fg);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ctitle {
		font-size: 16px;
		font-weight: 600;
	}
	.gsmall {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		flex-wrap: wrap;
	}
	/* Spec 009 C: does not block — the next mark is still a tap away */
	.flash {
		position: fixed;
		left: 50%;
		bottom: calc(env(safe-area-inset-bottom) + 72px);
		transform: translateX(-50%);
		z-index: 9;
		max-width: calc(100% - 32px);
		box-sizing: border-box;
		padding: 9px 16px;
		border-radius: 14px;
		background: var(--text);
		color: var(--bg);
		font-size: 14px;
		text-decoration: none;
		text-align: center;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.2);
		animation: flash-in 0.18s ease-out;
	}
	@keyframes flash-in {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
	}
	.review-banner {
		display: block;
		margin: 0 0 10px;
		padding: 12px 14px;
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
	}
	.cstep {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
		font-size: 14px;
	}
	.cstep input,
	.steps-today input {
		flex: none;
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--text);
	}
	.cstep .first {
		flex: none;
		padding: 0 6px;
		border: 1px solid currentColor;
		border-radius: 999px;
		font-size: 11px;
		opacity: 0.75;
	}
	.cstep .sttl,
	.steps-today .sttl {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	button.sttl {
		padding: 4px 0;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.more-steps {
		flex: none;
		font-size: 12px;
		opacity: 0.75;
	}
	.steps-today {
		margin: 0 0 10px;
	}
	.steps-today ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border-radius: 12px;
		background: var(--surface);
	}
	.steps-today li {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 0 12px;
	}
	.steps-today li + li {
		border-top: 1px solid var(--line);
	}
	.sgoal {
		flex: none;
		max-width: 40%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: var(--muted);
	}
	.more-btn2 {
		min-height: 36px;
		border: none;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.flash .undo {
		margin-left: 12px;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		font-weight: 700;
		text-decoration: underline;
		cursor: pointer;
	}
	.due-card {
		margin: 4px 0 12px;
		padding: 14px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--line);
	}
	/* #24: a thin progress bar under the title; the numbers stand in the dose column */
	.vbar {
		display: block;
		width: 100%;
		max-width: 160px;
		height: 3px;
		margin-top: 5px;
		border-radius: 2px;
		background: linear-gradient(var(--c), var(--c)) no-repeat left / var(--vp) 100%, color-mix(in oklab, currentColor 18%, transparent);
	}
	.vol-form {
		display: flex;
		gap: 6px;
		align-items: center;
		margin-top: 6px;
	}
	.vol-form label {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		font-size: 14px;
	}
	.vol-form input {
		flex: 1;
		min-width: 0;
		min-height: 40px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	.vol-form button {
		min-height: 40px;
		padding: 0 12px;
		border: none;
		border-radius: 10px;
		background: var(--text);
		color: var(--bg);
		font: inherit;
		cursor: pointer;
	}
	.chead-col {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
	}
	/* Spec 009 B: quiet goal line; it must not make the card taller */
	.mline {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		max-width: 100%;
		font-size: 13px;
		line-height: 1.2;
		opacity: 0.75;
		color: inherit;
		text-decoration: none;
		white-space: nowrap;
		/* #18: a taller touch area that grows only downwards, into the card's own padding: upwards it
		   would cover the title, whose tap opens the card */
		padding: 2px 8px 12px 0;
		margin: -2px -8px -12px 0;
		position: relative;
		z-index: 1;
	}
	.mline .mgoal {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mline .sep {
		margin: 0 1px;
	}
	.mline :global(svg) {
		flex: none;
	}
	.mline .none {
		opacity: 0.75;
	}
	.tag {
		margin-left: 8px;
		padding: 1px 6px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		border: 1px solid currentColor;
		vertical-align: 2px;
	}
	.dose {
		flex: none;
		max-width: 40%;
		text-align: right;
		font-size: 12px;
		opacity: 0.8;
	}
	.more {
		margin-top: 20px;
	}
	.more summary {
		font-size: 15px;
		color: var(--muted);
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}
	.card-wrap {
		position: relative;
	}
	/* Spec 006: a day card is not one big button — the box marks, the text opens the day note */
	.more-btn.handle {
		touch-action: none;
		font-size: 22px;
		cursor: grab;
	}
	.cards.reorder .card {
		pointer-events: none;
	}
	.cards.reorder .card-wrap {
		user-select: none;
		-webkit-user-select: none;
	}
	li.dragging .card {
		box-shadow: 0 6px 18px rgb(0 0 0 / 0.25);
		transform: scale(1.02);
	}
	.card {
		cursor: pointer;
	}
	.chead {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.box-btn {
		position: relative;
	}
	/* the box's touch area is 44 pt even though it looks smaller */
	.box-btn::before {
		content: '';
		position: absolute;
		inset: -10px;
	}
	.box-btn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.cexpand {
		display: flex;
		flex-direction: column;
		gap: 10px;
		cursor: default;
	}
	/* task 13: minimum and norm stay as short chips; «±» opens the quantity field */
	.dose-row {
		display: flex;
		gap: 8px;
	}
	.dose-row button,
	.qty input,
	.qty button {
		min-height: 44px;
		border-radius: 22px;
		border: 1px solid color-mix(in oklab, var(--fg) 30%, transparent);
		background: color-mix(in oklab, var(--surface) 70%, transparent);
		color: var(--text);
		font: inherit;
		font-size: 15px;
		cursor: pointer;
	}
	.dose-row button {
		padding: 0 16px;
	}
	.qty {
		display: flex;
		gap: 6px;
	}
	.qty input {
		flex: 1;
		min-width: 0;
		border-radius: 10px;
		padding: 0 10px;
		font-size: 17px;
		cursor: text;
	}
	.qty button {
		width: 48px;
		border-radius: 10px;
	}
	/* task 13: the icon row, 44 pt targets; a note that does not exist yet is dimmed */
	/* up to eight 40 pt icons on one line on a phone (#27 added the link) */
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0;
		margin: 0 -6px -4px;
	}
	.actions button,
	.actions .flag-btn {
		width: 40px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--fg);
		font: inherit;
		cursor: pointer;
	}
	.actions .link-btn {
		opacity: 0.45;
	}
	.actions .link-btn.on {
		opacity: 1;
		color: var(--link);
	}
	.actions .flag-btn.dim,
	.actions button.dim {
		opacity: 0.4;
	}
	.actions .qty-btn {
		font-size: 22px;
		font-weight: 600;
	}
	.actions .qty-btn.on {
		background: color-mix(in oklab, var(--fg) 14%, transparent);
	}
	.box-btn {
		padding: 0;
		background: none;
		cursor: pointer;
		color: var(--fg);
		margin-top: 2px;
	}
	.card .dose {
		margin-right: 34px;
	}
	.card.nobox {
		grid-template-columns: minmax(0, 1fr) minmax(0, 36%);
	}
	.card .dose {
		max-width: none;
		justify-self: end;
	}
	.cnote {
		grid-column: 1 / -1;
		min-width: 0;
		margin-top: 6px;
	}
	.cline.cnote {
		display: block;
	}
	/* task 12: the star, a 44 pt target */
	.card.has-star {
		grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 32%);
	}
	.star {
		width: 44px;
		height: 44px;
		margin: -10px -6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.star.on {
		color: #e0a400;
	}
	.actions .star {
		margin: 0;
	}
	.actions .star:not(.on) {
		color: var(--fg);
	}
	/* #12: the sections of «Сделать что-то ещё» */
	.sub-title {
		margin: 14px 0 6px;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.other-tree :global(h2) {
		margin-top: 16px;
	}
	.more-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: absolute;
		top: 8px;
		right: 6px;
		width: 40px;
		height: 44px;
		border: none;
		background: none;
		border-radius: 10px;
		font-size: 20px;
		line-height: 1;
		color: var(--muted);
		cursor: pointer;
	}
	.card-wrap[data-depth='1'] .more-btn,
	.card-wrap[data-depth='1.5'] .more-btn {
		color: #fff;
	}
	/* task 11: links on cards — the link colour, underlined; on a filled card (white text) the text
	   colour with a thicker underline, so they stay readable on any practice colour */
	.cnote :global(a) {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.card[data-depth='1'] :global(a),
	.card[data-depth='1.5'] :global(a) {
		color: inherit;
		text-decoration-thickness: 2px;
		font-weight: 600;
	}
	/* task 13: the first block wraps to the card's width, nothing is cut */
	.cline {
		opacity: 0.9;
		margin-top: 2px;
		overflow-wrap: anywhere;
	}
	.cline :global(.note-view) {
		font-size: 13px;
		line-height: 1.35;
	}
	.cline :global(ul) {
		margin: 0;
	}
	.weeknav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: -4px -8px 8px;
	}
	.weeknav .icon {
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--text);
		cursor: pointer;
	}
	.weeknav .link {
		border: none;
		background: none;
		color: var(--muted);
		font-size: 14px;
		min-height: 44px;
		cursor: pointer;
	}
	.lens-label {
		margin: -4px 0 8px;
		font-size: 13px;
		color: var(--muted);
	}
	.reorder-hint {
		position: sticky;
		top: calc(env(safe-area-inset-top) + 50px);
		z-index: 4;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin: 0 0 10px;
		padding: 6px 6px 6px 12px;
		border-radius: 12px;
		background: var(--text);
		color: var(--bg);
		font-size: 14px;
	}
	.reorder-hint button {
		min-height: 36px;
		padding: 0 14px;
		border: none;
		border-radius: 9px;
		background: var(--bg);
		color: var(--text);
		font-weight: 600;
		cursor: pointer;
	}

	/* ── #30: the two zones ── */
	.deeds {
		margin: 4px 0 16px;
	}
	.deeds ul {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface);
		border-radius: 12px;
		overflow: hidden;
	}
	.deeds li {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 2px 10px;
		min-height: 48px;
		padding: 6px 12px;
	}
	.deeds li + li {
		border-top: 1px solid var(--line);
	}
	.round {
		flex: none;
		width: 24px;
		height: 24px;
		border: 2px solid var(--muted);
		border-radius: 50%;
		background: none;
		cursor: pointer;
	}
	.dt {
		flex: 1;
		min-width: 0;
		font-size: 16px;
	}
	.dtools {
		--fg: var(--text);
		flex-basis: 100%;
		padding: 4px 0 0 34px;
		box-sizing: border-box;
	}
	.dtools .actions {
		margin: 0 -6px 0 -10px;
	}
	.dtools .actions.few {
		justify-content: flex-start;
		gap: 14px;
	}
	.deeds .dtools .actions button.on {
		background: color-mix(in oklab, var(--fg) 14%, transparent);
	}
	.dwhen {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 8px;
		margin-bottom: 6px;
	}
	.dwhen button,
	.dwhen input {
		min-height: 40px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: 15px;
		cursor: pointer;
	}
	.dwhen label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		color: var(--muted);
	}
	button.dt {
		padding: 4px 0;
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
		text-align: left;
		cursor: pointer;
	}
	.dw {
		flex-basis: 100%;
		padding-left: 34px;
		font-size: 12px;
		color: var(--muted);
	}
	.add-deed {
		display: flex;
		gap: 6px;
		margin-top: 6px;
	}
	.add-deed input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0 12px;
		border: 1px dashed var(--line);
		border-radius: 12px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 16px;
	}
	.dgoal {
		max-width: 40%;
		min-height: 44px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		color: var(--muted);
		font: inherit;
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
	}
	.dsub {
		margin: 10px 0 4px;
		font-size: 13px;
		color: var(--muted);
	}
	.ddone li .dt {
		text-decoration: line-through;
		color: var(--muted);
	}
	.ddone li .dw {
		padding-left: 0;
	}
	.card.stripe {
		border-left: 4px solid var(--c-light);
	}
	.cube {
		flex: none;
		width: 44px;
		height: 44px;
		margin: -8px 0 -8px -8px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		cursor: pointer;
	}
	.cube svg {
		width: 28px;
		height: 28px;
	}
	.cube-frame {
		fill: none;
		stroke: var(--c-light);
		stroke-width: 2.5;
	}
	.cube-fill {
		fill: var(--c-light);
		transition:
			y 0.35s ease-out,
			height 0.35s ease-out;
	}
	.cube:disabled {
		opacity: 0.4;
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: rgb(0 0 0 / 0.35);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 21;
		max-width: 560px;
		max-height: 80vh;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		padding: 8px 16px calc(env(safe-area-inset-bottom) + 12px);
		background: var(--bg);
		border-radius: 16px 16px 0 0;
	}
	.sheet header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 44px;
	}
	.sheet .st {
		font-weight: 700;
	}
	.sheet .done {
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.sbody {
		overflow-y: auto;
	}
	.dcount {
		margin-left: 8px;
		font-size: 12px;
		color: var(--muted);
	}
	.dnote {
		flex-basis: 100%;
		padding-left: 34px;
		font-size: 15px;
	}
	.steps-today li {
		flex-wrap: wrap;
	}
	.dnote.classic {
		padding-left: 30px;
	}
</style>
