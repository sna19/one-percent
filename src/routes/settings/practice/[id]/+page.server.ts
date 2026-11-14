import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/db.js';
import { loadSettings } from '#lib/server/settings.js';

export function load({ params }) {
	const s = loadSettings(getDb());
	const practice = s.practices.find((p) => p.id === Number(params.id));
	if (!practice) error(404, 'Практика не найдена');
	return { ...s, practice };
}
