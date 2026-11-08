import { fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import {
	InputError,
	loadSettings,
	moveItem,
	saveCategory,
	saveFormat,
	saveGoal,
	savePractice,
	setArchived
} from '#lib/server/settings.js';

export function load() {
	return loadSettings(getDb());
}

const run = (fn: (f: FormData) => void) => async ({ request }: { request: Request }) => {
	try {
		fn(await request.formData());
	} catch (e) {
		if (e instanceof InputError) return fail(400, { error: e.message });
		throw e;
	}
};

export const actions = {
	category: run((f) => saveCategory(getDb(), f)),
	goal: run((f) => saveGoal(getDb(), f)),
	practice: run((f) => savePractice(getDb(), f)),
	archive: run((f) => setArchived(getDb(), f, true)),
	restore: run((f) => setArchived(getDb(), f, false)),
	format: run((f) => saveFormat(getDb(), f)),
	move: run((f) => moveItem(getDb(), f))
};
