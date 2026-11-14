/** Spec 007 C — calls to the settings API from the new screens. */
export async function settingsApi(action: string, body: object) {
	const r = await fetch(`/api/settings/${action}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const j = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(j.message ?? 'Не сохранилось');
	return j;
}
