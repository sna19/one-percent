/**
 * #29 — the registry of the app's own rules: every number the owner may tune (a limit, a term, a threshold)
 * lives here, with its default, its range and a «?» text. The «Приложение» screen is built from this list;
 * a new number-rule goes here and nowhere else (Definition of Done).
 *
 * Values are kept in `app_settings` (key → value); a key without a row has its default.
 */

export type Group = 'general' | 'inbox' | 'today' | 'week' | 'goals';

export const GROUPS: { key: Group; title: string }[] = [
	{ key: 'general', title: 'Общее' },
	{ key: 'inbox', title: 'Входящие' },
	{ key: 'today', title: 'Сегодня' },
	{ key: 'week', title: 'Неделя и итоги' },
	{ key: 'goals', title: 'Цели' }
];

interface Base {
	key: string;
	group: Group;
	title: string;
	/** what it changes, why the default, where the effect shows */
	help: string;
}
export interface IntSetting extends Base {
	type: 'int';
	default: number;
	min: number;
	max: number;
	unit?: string;
	/** null is allowed («без лимита») */
	nullable?: boolean;
}
export interface ChoiceSetting extends Base {
	type: 'choice';
	default: string;
	options: { value: string; label: string }[];
}
/** Shown, not changed in the app: the reason is in its help. */
export interface InfoSetting extends Base {
	type: 'info';
	default: string;
	text: string;
}
export type Setting = IntSetting | ChoiceSetting | InfoSetting;

export const SETTINGS: Setting[] = [
	{
		key: 'week.start',
		group: 'general',
		type: 'info',
		title: 'Неделя начинается',
		default: 'sunday',
		text: 'с воскресенья',
		help:
			'Неделя в приложении — с воскресенья по субботу, как рабочая неделя в Израиле: план, итоги и «Сегодня» листаются по таким неделям. Переключить на понедельник пока нельзя: все планы недель и их итоги хранятся по воскресеньям, и смена начала потребовала бы пересчитать старые недели. Если понадобится — это отдельная задача.'
	},
	{
		key: 'today.flash',
		group: 'today',
		type: 'choice',
		title: 'Вспышка после отметки',
		default: '2500',
		options: [
			{ value: '0', label: 'выкл' },
			{ value: '1500', label: '1,5 с' },
			{ value: '2500', label: '2,5 с' },
			{ value: '4000', label: '4 с' }
		],
		help:
			'Сколько держится строка внизу после отметки практики («+20 мин · Итальянский» с майлстоном). 2,5 секунды хватает прочитать и не мешает следующей отметке. «Выкл» — отметка без вспышки; отменить её можно, сняв галочку.'
	},
	{
		key: 'today.steps_rows',
		group: 'today',
		type: 'int',
		title: 'Строк «Шагов» наверху',
		default: 3,
		min: 1,
		max: 6,
		help:
			'Сколько шагов без практики видно в блоке «Шаги» наверху «Сегодня», остальные — за «ещё N». Три — чтобы шаги напоминали о себе, но не вытесняли практики дня.'
	},
	{
		key: 'stale_days',
		group: 'inbox',
		type: 'int',
		title: 'Старые записи и шаги',
		default: 14,
		min: 7,
		max: 60,
		unit: 'дн',
		help:
			'Через сколько дней запись «Входящих» или шаг цели получают метку возраста («2 нед»). Две недели — срок, после которого несделанное уже стоит разобрать: сделать, перенести или убрать. Метка без красного и без счётчиков.'
	},
	{
		key: 'inbox.history_days',
		group: 'inbox',
		type: 'int',
		title: 'История разобранного',
		default: 30,
		min: 7,
		max: 365,
		unit: 'дн',
		help: 'Сколько дней разобранные и закрытые записи видны в «Истории» «Входящих». Месяц — чтобы найти недавно разобранное; сами записи не удаляются.'
	},
	{
		key: 'plan.day_overload',
		group: 'week',
		type: 'int',
		title: 'Перегруз дня',
		default: 6,
		min: 3,
		max: 15,
		unit: 'практик',
		help:
			'Сколько практик в плане одного дня — ещё нормально. Выше — план недели мягко предупреждает у этого дня: перегруженный день обычно кончается «по плану 3 из 10», и тогда выпадают как раз фундаментальные цели.'
	},
	{
		key: 'plan_limit',
		group: 'week',
		type: 'int',
		title: 'Практик в плане недели',
		default: 0,
		min: 1,
		max: 200,
		nullable: true,
		help:
			'Мягкий лимит числа практик в плане недели: выше него план недели и итоги предупреждают о перегрузе. По умолчанию без лимита — его стоит поставить, когда станет видно, сколько практик реально тянется за неделю.'
	},
	{
		key: 'review.max_rows',
		group: 'week',
		type: 'int',
		title: 'Строк в блоке итогов',
		default: 3,
		min: 1,
		max: 10,
		help: 'Сколько строк показывает каждый блок итогов недели (затухающие цели, майлстоны), остальные — за «ещё N». Три — чтобы итоги читались за минуту.'
	},
	{
		key: 'review.stuck_step_days',
		group: 'week',
		type: 'int',
		title: 'Застрявший шаг в итогах',
		default: 21,
		min: 7,
		max: 60,
		unit: 'дн',
		help:
			'Через сколько дней несделанный шаг попадает в итоги недели вопросом «что мешает?». Три недели — дольше, чем метка возраста на экране цели: в итоги стоит выносить то, что застряло всерьёз.'
	},
	{
		key: 'goals.focus_max',
		group: 'goals',
		type: 'int',
		title: 'Цели в фокусе',
		default: 3,
		min: 1,
		max: 5,
		help:
			'Сколько целей можно отметить ★ на неделю. Лимит — защита от главной проблемы: новые цели вытесняют фундаментальные. Больше фокусов — меньше фокуса. Если уменьшить ниже числа ★ этой недели, приложение спросит, какие снять.'
	}
];

export const SETTING = Object.fromEntries(SETTINGS.map((s) => [s.key, s])) as Record<string, Setting>;

/** Every value with its default filled in; a stored value that no longer fits its range falls back to the default. */
export type Values = Record<string, number | string | null>;

export function defaults(): Values {
	return Object.fromEntries(SETTINGS.map((s) => [s.key, s.type === 'int' && s.nullable ? null : s.default]));
}

/** A stored text value → the setting's value, or undefined when it is not valid for the setting. */
export function parseValue(s: Setting, raw: string | null | undefined): number | string | null | undefined {
	if (s.type === 'info') return undefined;
	if (raw === null || raw === undefined || raw === '') return s.type === 'int' && s.nullable ? null : undefined;
	if (s.type === 'choice') return s.options.some((o) => o.value === raw) ? raw : undefined;
	const n = Number(raw);
	return Number.isInteger(n) && n >= s.min && n <= s.max ? n : undefined;
}

export function merge(stored: Record<string, string>): Values {
	const v = defaults();
	for (const s of SETTINGS) {
		const x = parseValue(s, stored[s.key]);
		if (x !== undefined) v[s.key] = x;
	}
	return v;
}

export const num = (v: Values, key: string): number => {
	const x = v[key];
	const s = SETTING[key];
	return typeof x === 'number' ? x : s.type === 'int' ? s.default : Number(s.default);
};
