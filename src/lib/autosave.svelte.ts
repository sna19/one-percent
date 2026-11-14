/** Spec 007 C — screens without a «Save» button: changes go to the settings API shortly after typing. */
export function autosaver(action: string, delay = 600) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let last: Record<string, unknown> | undefined;
	const state = $state({ status: '' as '' | 'saving' | 'saved' | 'error', message: '' });

	async function send(body: Record<string, unknown>) {
		state.status = 'saving';
		try {
			const r = await fetch(`/api/settings/${action}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const j = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(j.message ?? 'Не сохранилось');
			state.status = 'saved';
			state.message = '';
		} catch (e) {
			state.status = 'error';
			state.message = (e as Error).message;
		}
	}

	return {
		state,
		/** schedule a save of these fields */
		save(body: Record<string, unknown>) {
			last = body;
			clearTimeout(timer);
			timer = setTimeout(() => send(body), delay);
		},
		/** save now (leaving the screen) */
		async flush() {
			clearTimeout(timer);
			if (last && state.status !== 'saved') await send(last);
		}
	};
}
