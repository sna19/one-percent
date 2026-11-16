/** Spec 013 A — names of the goal picture icons, in groups (no components: the server checks names here). */
export const GOAL_ICON_GROUPS: { name: string; icons: string[] }[] = [
	{ name: 'Языки', icons: ['languages', 'book-a', 'speech', 'message-circle', 'globe', 'graduation-cap'] },
	{ name: 'Спорт и здоровье', icons: ['dumbbell', 'bike', 'footprints', 'heart-pulse', 'activity', 'trophy', 'waves-horizontal', 'mountain'] },
	{ name: 'Еда', icons: ['apple', 'salad', 'utensils', 'coffee', 'carrot', 'cooking-pot', 'soup'] },
	{ name: 'Дом и сад', icons: ['house', 'sofa', 'flower-2', 'sprout', 'leaf', 'trees', 'shovel'] },
	{ name: 'Музыка', icons: ['piano', 'guitar', 'mic', 'headphones', 'drum'] },
	{ name: 'Работа', icons: ['briefcase', 'laptop', 'presentation', 'chart-line', 'target', 'lightbulb', 'pen-tool'] },
	{ name: 'Чтение', icons: ['book', 'book-open', 'library', 'newspaper', 'notebook-pen', 'glasses'] },
	{ name: 'Техника', icons: ['printer', 'cpu', 'wrench', 'hammer', 'code', 'camera'] },
	{ name: 'Разное', icons: ['palette', 'brush', 'gamepad-2', 'brain', 'moon', 'sun', 'hand-heart', 'users', 'baby', 'dog', 'plane', 'map', 'wallet', 'piggy-bank'] }
];

export const GOAL_ICON_NAMES = new Set(GOAL_ICON_GROUPS.flatMap((g) => g.icons));
