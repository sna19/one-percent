/** Fixed category palette, no red (DECISIONS 2026-11-06). Keys are stored in categories.color. */
export const palette = {
	blue: { name: 'Синий', light: '#2f6fdf', dark: '#5b93f5' },
	teal: { name: 'Бирюзовый', light: '#0f9488', dark: '#2cc2b3' },
	green: { name: 'Зелёный', light: '#2a9d4b', dark: '#4cc56f' },
	lime: { name: 'Салатовый', light: '#6b9a12', dark: '#9ccc3a' },
	amber: { name: 'Янтарный', light: '#c98a06', dark: '#f0b429' },
	violet: { name: 'Фиолетовый', light: '#7c4ddb', dark: '#a184f0' },
	indigo: { name: 'Индиго', light: '#4b55c9', dark: '#7f88ee' },
	pink: { name: 'Розовый', light: '#c2408f', dark: '#e872b8' },
	slate: { name: 'Графит', light: '#5b6878', dark: '#94a3b8' }
} as const;

export type PaletteKey = keyof typeof palette;
export const paletteKeys = Object.keys(palette) as PaletteKey[];

export function colorOf(key: string) {
	return palette[key as PaletteKey] ?? palette.slate;
}
