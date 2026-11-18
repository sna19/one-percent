import { defaults, num, type Values } from './registry.js';

/**
 * #29 — the registry's values on the device: kept from the last visit (they work offline), refreshed from the
 * server when the app opens and when the «Приложение» screen changes one.
 */
const KEY = 'app-settings';

export const appSettings = $state<{ v: Values }>({ v: defaults() });

export function setAppSettings(v: Values) {
	appSettings.v = { ...defaults(), ...v };
	try {
		localStorage.setItem(KEY, JSON.stringify(appSettings.v));
	} catch {
		/* private mode */
	}
}

export async function loadAppSettings() {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (saved) appSettings.v = { ...defaults(), ...saved };
	} catch {
		/* ignore */
	}
	const r = await fetch('/api/app-settings').catch(() => undefined);
	if (r?.ok) setAppSettings((await r.json()).values);
}

/** A number-rule of the registry, reactive. */
export const appNum = (key: string) => num(appSettings.v, key);
