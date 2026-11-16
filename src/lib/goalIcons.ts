import type { Component } from 'svelte';
export { GOAL_ICON_GROUPS, GOAL_ICON_NAMES } from './goalIconNames.js';
import LanguagesIcon from '@lucide/svelte/icons/languages';
import BookAIcon from '@lucide/svelte/icons/book-a';
import SpeechIcon from '@lucide/svelte/icons/speech';
import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
import GlobeIcon from '@lucide/svelte/icons/globe';
import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
import DumbbellIcon from '@lucide/svelte/icons/dumbbell';
import BikeIcon from '@lucide/svelte/icons/bike';
import FootprintsIcon from '@lucide/svelte/icons/footprints';
import HeartPulseIcon from '@lucide/svelte/icons/heart-pulse';
import ActivityIcon from '@lucide/svelte/icons/activity';
import TrophyIcon from '@lucide/svelte/icons/trophy';
import WavesHorizontalIcon from '@lucide/svelte/icons/waves-horizontal';
import MountainIcon from '@lucide/svelte/icons/mountain';
import AppleIcon from '@lucide/svelte/icons/apple';
import SaladIcon from '@lucide/svelte/icons/salad';
import UtensilsIcon from '@lucide/svelte/icons/utensils';
import CoffeeIcon from '@lucide/svelte/icons/coffee';
import CarrotIcon from '@lucide/svelte/icons/carrot';
import CookingPotIcon from '@lucide/svelte/icons/cooking-pot';
import SoupIcon from '@lucide/svelte/icons/soup';
import HouseIcon from '@lucide/svelte/icons/house';
import SofaIcon from '@lucide/svelte/icons/sofa';
import Flower2Icon from '@lucide/svelte/icons/flower-2';
import SproutIcon from '@lucide/svelte/icons/sprout';
import LeafIcon from '@lucide/svelte/icons/leaf';
import TreesIcon from '@lucide/svelte/icons/trees';
import ShovelIcon from '@lucide/svelte/icons/shovel';
import PianoIcon from '@lucide/svelte/icons/piano';
import GuitarIcon from '@lucide/svelte/icons/guitar';
import MicIcon from '@lucide/svelte/icons/mic';
import HeadphonesIcon from '@lucide/svelte/icons/headphones';
import DrumIcon from '@lucide/svelte/icons/drum';
import BriefcaseIcon from '@lucide/svelte/icons/briefcase';
import LaptopIcon from '@lucide/svelte/icons/laptop';
import PresentationIcon from '@lucide/svelte/icons/presentation';
import ChartLineIcon from '@lucide/svelte/icons/chart-line';
import TargetIcon from '@lucide/svelte/icons/target';
import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
import PenToolIcon from '@lucide/svelte/icons/pen-tool';
import BookIcon from '@lucide/svelte/icons/book';
import BookOpenIcon from '@lucide/svelte/icons/book-open';
import LibraryIcon from '@lucide/svelte/icons/library';
import NewspaperIcon from '@lucide/svelte/icons/newspaper';
import NotebookPenIcon from '@lucide/svelte/icons/notebook-pen';
import GlassesIcon from '@lucide/svelte/icons/glasses';
import PrinterIcon from '@lucide/svelte/icons/printer';
import CpuIcon from '@lucide/svelte/icons/cpu';
import WrenchIcon from '@lucide/svelte/icons/wrench';
import HammerIcon from '@lucide/svelte/icons/hammer';
import CodeIcon from '@lucide/svelte/icons/code';
import CameraIcon from '@lucide/svelte/icons/camera';
import PaletteIcon from '@lucide/svelte/icons/palette';
import BrushIcon from '@lucide/svelte/icons/brush';
import Gamepad2Icon from '@lucide/svelte/icons/gamepad-2';
import BrainIcon from '@lucide/svelte/icons/brain';
import MoonIcon from '@lucide/svelte/icons/moon';
import SunIcon from '@lucide/svelte/icons/sun';
import HandHeartIcon from '@lucide/svelte/icons/hand-heart';
import UsersIcon from '@lucide/svelte/icons/users';
import BabyIcon from '@lucide/svelte/icons/baby';
import DogIcon from '@lucide/svelte/icons/dog';
import PlaneIcon from '@lucide/svelte/icons/plane';
import MapIcon from '@lucide/svelte/icons/map';
import WalletIcon from '@lucide/svelte/icons/wallet';
import PiggyBankIcon from '@lucide/svelte/icons/piggy-bank';

/**
 * Spec 013 A — the goal picture's icon set: about sixty line icons of the app's library, in groups.
 * A goal stores the icon's name; an unknown name (an icon removed later) falls back to the text picture.
 */
export const GOAL_ICONS: Record<string, Component<{ size?: number; strokeWidth?: number }>> = {
	'languages': LanguagesIcon,
	'book-a': BookAIcon,
	'speech': SpeechIcon,
	'message-circle': MessageCircleIcon,
	'globe': GlobeIcon,
	'graduation-cap': GraduationCapIcon,
	'dumbbell': DumbbellIcon,
	'bike': BikeIcon,
	'footprints': FootprintsIcon,
	'heart-pulse': HeartPulseIcon,
	'activity': ActivityIcon,
	'trophy': TrophyIcon,
	'waves-horizontal': WavesHorizontalIcon,
	'mountain': MountainIcon,
	'apple': AppleIcon,
	'salad': SaladIcon,
	'utensils': UtensilsIcon,
	'coffee': CoffeeIcon,
	'carrot': CarrotIcon,
	'cooking-pot': CookingPotIcon,
	'soup': SoupIcon,
	'house': HouseIcon,
	'sofa': SofaIcon,
	'flower-2': Flower2Icon,
	'sprout': SproutIcon,
	'leaf': LeafIcon,
	'trees': TreesIcon,
	'shovel': ShovelIcon,
	'piano': PianoIcon,
	'guitar': GuitarIcon,
	'mic': MicIcon,
	'headphones': HeadphonesIcon,
	'drum': DrumIcon,
	'briefcase': BriefcaseIcon,
	'laptop': LaptopIcon,
	'presentation': PresentationIcon,
	'chart-line': ChartLineIcon,
	'target': TargetIcon,
	'lightbulb': LightbulbIcon,
	'pen-tool': PenToolIcon,
	'book': BookIcon,
	'book-open': BookOpenIcon,
	'library': LibraryIcon,
	'newspaper': NewspaperIcon,
	'notebook-pen': NotebookPenIcon,
	'glasses': GlassesIcon,
	'printer': PrinterIcon,
	'cpu': CpuIcon,
	'wrench': WrenchIcon,
	'hammer': HammerIcon,
	'code': CodeIcon,
	'camera': CameraIcon,
	'palette': PaletteIcon,
	'brush': BrushIcon,
	'gamepad-2': Gamepad2Icon,
	'brain': BrainIcon,
	'moon': MoonIcon,
	'sun': SunIcon,
	'hand-heart': HandHeartIcon,
	'users': UsersIcon,
	'baby': BabyIcon,
	'dog': DogIcon,
	'plane': PlaneIcon,
	'map': MapIcon,
	'wallet': WalletIcon,
	'piggy-bank': PiggyBankIcon
};

