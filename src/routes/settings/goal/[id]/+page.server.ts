import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { loadSettings } from '#lib/server/settings.js';

export function load({ params }) {
	const s = loadSettings(getDb());
	const goal = s.goals.find((g) => g.id === Number(params.id));
	if (!goal) error(404, 'Цель не найдена');
	return { ...s, goal };
}
