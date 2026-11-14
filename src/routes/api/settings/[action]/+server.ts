import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import {
	applyTreeDrop,
	createGoal,
	createPractice,
	InputError,
	saveCategory,
	saveFormat,
	saveGoal,
	savePlanLimit,
	savePractice,
	saveTemplate,
	setArchived
} from '#lib/server/settings.js';

/**
 * Spec 007 C — JSON face of the settings forms, for the new screens with autosave. The body is the
 * same fields the forms send ({ id?, title, … }); arrays become repeated fields (defaultDays).
 * Answers with the saved row's id.
 */
const actions: Record<string, (f: FormData) => void> = {
	practice: (f) => savePractice(getDb(), f),
	goal: (f) => saveGoal(getDb(), f),
	category: (f) => saveCategory(getDb(), f),
	format: (f) => saveFormat(getDb(), f),
	template: (f) => saveTemplate(getDb(), f),
	limit: (f) => savePlanLimit(getDb(), f),
	archive: (f) => setArchived(getDb(), f, true),
	restore: (f) => setArchived(getDb(), f, false)
};

export async function POST({ params, request }) {
	const b = await request.json().catch(() => null);
	if (!b || typeof b !== 'object') error(400, 'expected JSON');
	try {
		if (params.action === 'newPractice') return json({ ok: true, id: createPractice(getDb(), Number(b.goalId)) });
		if (params.action === 'newGoal') return json({ ok: true, id: createGoal(getDb(), Number(b.categoryId)) });
		if (params.action === 'tree') {
			applyTreeDrop(getDb(), b);
			return json({ ok: true });
		}
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
	const run = actions[params.action];
	if (!run) error(404, 'unknown action');
	const f = new FormData();
	for (const [k, v] of Object.entries(b)) {
		if (Array.isArray(v)) v.forEach((x) => f.append(k, String(x)));
		else if (typeof v === 'boolean') {
			if (v) f.set(k, 'on');
		} else if (v !== null && v !== undefined) f.set(k, String(v));
	}
	try {
		run(f);
	} catch (e) {
		if (e instanceof InputError) error(400, e.message);
		throw e;
	}
	return json({ ok: true });
}
