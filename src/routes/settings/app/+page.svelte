<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import TopBar from '#lib/TopBar.svelte';
	import { backFrom } from '#lib/back.js';
	import { appSettings, setAppSettings } from '#lib/appSettings.svelte.js';
	import { GROUPS, SETTINGS, defaults, type IntSetting, type Setting } from '#lib/registry.js';
	import { todayStr, weekStart } from '#lib/dates.js';

	/**
	 * #29 — «Приложение»: the registry of the app's own rules, grouped by world. Each has its value, a «?» (what it
	 * changes, why the default, where the effect shows) and «Сбросить к умолчанию». Ranges are fixed: a stepper or a
	 * choice, no free input. Built from the registry: a new rule appears here by itself.
	 */
	const v = $derived(appSettings.v);
	const dflt = defaults();
	let open = $state<string | null>(null);
	let error = $state<string | null>(null);
	let saving = $state<string | null>(null);
	// lowering «Цели в фокусе» below this week's ★: which to take off
	let over = $state<{ start: string; max: number; goals: { id: number; title: string }[] } | null>(null);
	let keep = $state<number[]>([]);

	onMount(async () => {
		const r = await fetch('/api/app-settings').catch(() => undefined);
		if (r?.ok) setAppSettings((await r.json()).values);
	});

	async function save(key: string, value: unknown, reset = false) {
		error = null;
		saving = key;
		try {
			const r = await fetch('/api/app-settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key, value, reset, today: todayStr() })
			});
			const j = await r.json().catch(() => null);
			if (!r.ok) return (error = j?.message ?? 'Не сохранилось');
			setAppSettings(j.values);
			if (j.focusOver) {
				over = j.focusOver;
				keep = j.focusOver.goals.slice(0, j.focusOver.max).map((g: { id: number }) => g.id);
			}
		} catch {
			error = 'Нет связи с сервером';
		} finally {
			saving = null;
		}
	}
	const step = (s: IntSetting, d: number) => {
		const cur = typeof v[s.key] === 'number' ? (v[s.key] as number) : s.nullable ? s.min - 1 : s.default;
		const next = cur + d;
		if (s.nullable && next < s.min) return save(s.key, null);
		if (next < s.min || next > s.max) return;
		save(s.key, next);
	};
	const shown = (s: Setting) => {
		const x = v[s.key];
		if (s.type === 'info') return s.text;
		if (s.type === 'choice') return s.options.find((o) => o.value === x)?.label ?? String(x);
		if (x === null) return 'без лимита';
		return `${x}${s.unit ? ` ${s.unit}` : ''}`;
	};
	const isDefault = (s: Setting) => s.type === 'info' || v[s.key] === dflt[s.key];

	async function applyOver() {
		if (!over) return;
		const r = await fetch('/api/review', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'focus', start: over.start ?? weekStart(todayStr()), today: todayStr(), goalIds: keep })
		}).catch(() => undefined);
		if (!r?.ok) return (error = 'Фокус не изменился — нет связи с сервером');
		over = null;
	}
</script>

<svelte:head><title>Приложение · 1%</title></svelte:head>

<main>
	<TopBar help="settings-app" title="Приложение" back={page.url.searchParams.get('from') ? backFrom(page.url.searchParams) : { label: 'Настройки', href: '/settings' }} />
	<p class="lead">Правила приложения в одном месте. У каждого — «?»: что меняет и почему такое значение по умолчанию.</p>
	{#if error}<p class="err" role="alert">{error}</p>{/if}

	{#each GROUPS as g (g.key)}
		{@const list = SETTINGS.filter((s) => s.group === g.key)}
		{#if list.length}
			<h2>{g.title}</h2>
			<ul class="list">
				{#each list as s (s.key)}
					<li>
						<div class="row">
							<span class="title">{s.title}</span>
							<button class="q" aria-label="{s.title}: что это" aria-expanded={open === s.key} onclick={() => (open = open === s.key ? null : s.key)}><CircleHelp size={18} /></button>
							<span class="grow"></span>
							{#if s.type === 'int'}
								<span class="stepper" aria-label={s.title}>
									<button aria-label="Меньше" disabled={saving === s.key || (v[s.key] === null) || (!s.nullable && (v[s.key] as number) <= s.min)} onclick={() => step(s, -1)}><Minus size={16} /></button>
									<b>{shown(s)}</b>
									<button aria-label="Больше" disabled={saving === s.key || (v[s.key] as number) >= s.max} onclick={() => step(s, +1)}><Plus size={16} /></button>
								</span>
							{:else if s.type === 'choice'}
								<span class="seg" role="radiogroup" aria-label={s.title}>
									{#each s.options as o (o.value)}
										<button role="radio" aria-checked={v[s.key] === o.value} class:on={v[s.key] === o.value} disabled={saving === s.key} onclick={() => save(s.key, o.value)}>{o.label}</button>
									{/each}
								</span>
							{:else}
								<span class="info">{shown(s)}</span>
							{/if}
						</div>
						{#if open === s.key}
							<p class="help">{s.help}</p>
						{/if}
						{#if !isDefault(s)}
							<button class="reset" onclick={() => save(s.key, null, true)}>Сбросить к умолчанию · {s.type === 'choice' ? s.options.find((o) => o.value === dflt[s.key])?.label : s.type === 'int' && s.nullable ? 'без лимита' : dflt[s.key]}</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/each}
</main>

{#if over}
	<div class="backdrop" role="presentation"></div>
	<div class="sheet" role="dialog" aria-label="Какие цели снять с фокуса">
		<p class="st">В фокусе {over.goals.length}, а теперь можно {over.max}. Какие оставить?</p>
		<ul class="pick">
			{#each over.goals as g (g.id)}
				<li>
					<label
						><input
							type="checkbox"
							checked={keep.includes(g.id)}
							disabled={!keep.includes(g.id) && keep.length >= over.max}
							onchange={() => (keep = keep.includes(g.id) ? keep.filter((x) => x !== g.id) : [...keep, g.id])}
						/>★ {g.title}</label
					>
				</li>
			{/each}
		</ul>
		<button class="primary" disabled={keep.length > over.max} onclick={applyOver}>Оставить {keep.length}</button>
	</div>
{/if}

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 16px calc(env(safe-area-inset-bottom) + 32px);
	}
	.lead {
		margin: 0 0 8px;
		color: var(--muted);
		font-size: 14px;
	}
	h2 {
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 22px 0 8px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface);
		border-radius: 12px;
	}
	.list li {
		padding: 6px 12px 8px 14px;
	}
	.list li + li {
		border-top: 1px solid var(--line);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 44px;
		flex-wrap: wrap;
	}
	.title {
		font-size: 16px;
	}
	.grow {
		flex: 1;
	}
	.q {
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	/* the control keeps to the right, also when a long title pushes it to its own line */
	.stepper,
	.seg,
	.info {
		margin-left: auto;
	}
	.stepper {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.stepper button {
		width: 40px;
		height: 40px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg);
		color: var(--text);
		cursor: pointer;
	}
	.stepper button:disabled {
		opacity: 0.35;
	}
	.stepper b {
		min-width: 72px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.seg {
		display: inline-flex;
		gap: 3px;
		padding: 3px;
		border-radius: 10px;
		background: var(--bg);
	}
	.seg button {
		min-height: 34px;
		padding: 0 10px;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--text);
		color: var(--bg);
		font-weight: 600;
	}
	.info {
		color: var(--muted);
	}
	.help {
		margin: 0 0 6px;
		font-size: 14px;
		line-height: 1.45;
		color: var(--muted);
	}
	.reset {
		min-height: 32px;
		padding: 0;
		border: none;
		background: none;
		color: var(--link);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.err {
		color: var(--muted);
		font-size: 14px;
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
		margin: 0 auto;
		padding: 16px 16px calc(env(safe-area-inset-bottom) + 16px);
		background: var(--surface);
		border-radius: 16px 16px 0 0;
	}
	.st {
		margin: 0 0 8px;
		font-weight: 600;
	}
	.pick {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
	}
	.pick label {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
	}
	.pick input {
		width: 20px;
		height: 20px;
	}
	.primary {
		width: 100%;
		min-height: 44px;
		border: none;
		border-radius: 12px;
		background: var(--text);
		color: var(--bg);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.4;
	}
</style>
