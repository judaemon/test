import { FLOWER_KINDS, type FlowerKind } from "~/lib/flowers";
import type { RecipeItem } from "~/types/product";

/** Cart and order lines for built bouquets use this in place of a product id. */
export const CUSTOM_PRODUCT_ID = "_custom";
export const CUSTOM_IMAGE = "/images/bouquets/custom.svg";
/** Most stems of one flower and color in a single bouquet. */
export const MAX_STEMS_PER_FLOWER = 100;

/** Every flower has at least one color; a flower with one has no choice. */
export const SINGLE_COLOR_NAME = "Natural";

/** What sort of flower it is; staff can edit this for every flower. */
export interface FlowerKindSettings {
	/** Shoppers pick a color: true when the flower has more than one. */
	colors: boolean;
	/** Short note shown with the name, e.g. "big yellow chrysanthemum". */
	hint?: string;
}

/** One color of a flower, with its own price and stock. */
export interface FlowerColor {
	name: string;
	/** Each, per stem or bunch. */
	price: number;
	/** How many are left; missing means not counted. */
	stock?: number;
	enabled: boolean;
	/** Photo of this color; the flower's photo covers it otherwise. */
	image?: string;
}

export interface CustomFlowerOption {
	name: string;
	enabled: boolean;
	/** At least one; shoppers pick from them when there's more than one. */
	colors: FlowerColor[];
	/** Photo of the flower, shown beside it in recipes; empty if none. */
	image?: string;
	kind: FlowerKindSettings;
}

/** A row of the flowers table and its colors, as edited in Admin → Flowers. */
export interface FlowerRecord extends Omit<CustomFlowerOption, "colors"> {
	id: string;
	colors: (FlowerColor & { id: string })[];
	/** Signature bouquet colors whose recipe uses this flower. */
	usedIn: number;
}

/** A color still has stock (or isn't counted). */
export const colorInStock = (color: FlowerColor, needed = 1) =>
	color.stock === undefined || color.stock >= needed;

/**
 * The color an item is made in: the one picked, or the only color of a
 * flower that has just one (those items name no color).
 */
export function itemColor<C extends FlowerColor>(
	option: { colors: C[] } | undefined,
	color?: string,
): C | undefined {
	if (!option) return undefined;
	const wanted = color?.trim().toLowerCase();
	const [only] = option.colors;
	if (option.colors.length === 1 && only)
		return !wanted || only.name.toLowerCase() === wanted ? only : undefined;
	if (!wanted) return undefined;
	return option.colors.find((c) => c.name.toLowerCase() === wanted);
}

/** Stems of one flower color an item takes (old cluster items take one). */
export const itemUnits = (item: RecipeItem) => item.count ?? 1;

/** The photo for a flower in a given color, falling back to its main photo. */
export function flowerPhoto(
	option: CustomFlowerOption | undefined,
	color?: string,
): string | undefined {
	return itemColor(option, color)?.image || option?.image || undefined;
}

export interface CustomWrapper {
	id: string;
	name: string;
	colorHex: string;
	price: number;
	enabled: boolean;
	/** Wrappers left; each built bouquet uses one. Missing means not counted. */
	stock?: number;
	/** Photo of the wrapper; empty if none. */
	image?: string;
}

/** Whether a wrapper can go on another bouquet right now. */
export const wrapperInStock = (wrapper: CustomWrapper) =>
	wrapper.stock === undefined || wrapper.stock > 0;

/** Peso bills that can go into a money bouquet. */
export const PESO_BILLS = [20, 50, 100, 200, 500, 1000] as const;

export interface MoneySettings {
	/** Shows the "Add money" step in the builder. */
	enabled: boolean;
	/** Folding and handling, charged on top of each bill's value. */
	feePerBill: number;
	/** Which of PESO_BILLS shoppers can pick. */
	denominations: number[];
	/** Most bills in one bouquet. */
	maxBills: number;
}

export interface CustomBouquetSettings {
	/** Shows the builder in the shop. */
	enabled: boolean;
	/** Arranging and tying, added once per bouquet. */
	baseFee: number;
	flowers: CustomFlowerOption[];
	wrappers: CustomWrapper[];
	money: MoneySettings;
	/** False until staff save their own prices; the samples are placeholders. */
	saved: boolean;
}

/** Cash in a money bouquet, e.g. 10 × ₱100. */
export interface BillCount {
	value: number;
	count: number;
}

/** What the shopper built: flowers, cash and a wrapper. */
export interface CustomDesign {
	items: RecipeItem[];
	/** Money bouquets only. */
	bills?: BillCount[];
	wrapperId: string;
}

// Placeholder prices so the builder works before staff set real ones.
const SAMPLE_PRICES: Record<string, number> = {
	Sunflower: 120,
	Roses: 90,
	Carnations: 60,
	Gerbera: 70,
	Tulips: 150,
	Stargazer: 250,
	Amaranthus: 80,
	"White lily": 200,
	Chrysanthemum: 60,
	Sunlight: 80,
};
const SAMPLE_COLORS: Record<string, string[]> = {
	Roses: ["Red", "Pink", "White", "Yellow", "Peach"],
	Carnations: ["Red", "Pink", "White"],
	Gerbera: ["Red", "Pink", "Yellow", "Orange", "White"],
};

export const DEFAULT_CUSTOM_SETTINGS: CustomBouquetSettings = {
	enabled: true,
	baseFee: 300,
	flowers: FLOWER_KINDS.map((kind) =>
		withColors(
			{ name: kind.name, enabled: true, kind: kindSettings(kind) },
			startingColors(kind),
			SAMPLE_PRICES[kind.name] ?? 150,
		),
	),
	wrappers: [
		{
			id: "kraft",
			name: "Kraft brown",
			colorHex: "#c9a77c",
			price: 50,
			enabled: true,
		},
		{
			id: "black",
			name: "Black",
			colorHex: "#1f1a1c",
			price: 80,
			enabled: true,
		},
		{
			id: "white",
			name: "White",
			colorHex: "#f7f4ee",
			price: 80,
			enabled: true,
		},
		{
			id: "blush",
			name: "Blush pink",
			colorHex: "#f2c4ce",
			price: 80,
			enabled: true,
		},
	],
	money: {
		enabled: true,
		feePerBill: 10,
		denominations: [...PESO_BILLS],
		maxBills: 100,
	},
	saved: false,
};

/** A built-in flower's starting settings, before staff edit it. */
function kindSettings(kind: FlowerKind): FlowerKindSettings {
	return {
		colors: !!kind.colors,
		...(kind.hint ? { hint: kind.hint } : {}),
	};
}

/** A built-in flower's starting colors: its fixed choices, or the samples. */
function startingColors(kind: FlowerKind): string[] {
	if (Array.isArray(kind.colors)) return [...kind.colors];
	return kind.colors === true ? (SAMPLE_COLORS[kind.name] ?? []) : [];
}

/** A flower with these colors at one price; "Natural" when it has none. */
function withColors(
	flower: Omit<CustomFlowerOption, "colors">,
	names: string[],
	price: number,
	images: Record<string, string> = {},
): CustomFlowerOption {
	const colors = (names.length ? names : [SINGLE_COLOR_NAME]).map((name) => ({
		name,
		price,
		enabled: true,
		...(images[name] ? { image: images[name] } : {}),
	}));
	return {
		...flower,
		colors,
		kind: { ...flower.kind, colors: colors.length > 1 },
	};
}

/** How flowers were kept in the builder settings before their own tables. */
export interface LegacyFlowerOption {
	name: string;
	enabled: boolean;
	price: number;
	colors: string[];
	image?: string;
	colorImages?: Record<string, string>;
	kind?: FlowerKindSettings;
}

/**
 * The flower list kept in the builder settings before flowers had their own
 * tables, with each color at the flower's price. Flowers saved before they
 * could be edited get their kind from the built-in list. Only read when moving
 * old settings (or an old catalog snapshot) into the tables.
 */
export function flowersFromSettings(saved: {
	flowers?: LegacyFlowerOption[];
}): CustomFlowerOption[] {
	if (!saved.flowers) return DEFAULT_CUSTOM_SETTINGS.flowers;
	return saved.flowers.flatMap((flower): CustomFlowerOption[] => {
		const builtIn = FLOWER_KINDS.find((k) => k.name === flower.name);
		const kind = flower.kind ?? (builtIn && kindSettings(builtIn));
		if (!kind) return [];
		const colors =
			!flower.kind && !flower.colors.length && Array.isArray(builtIn?.colors)
				? [...builtIn.colors]
				: flower.colors;
		return [
			withColors(
				{
					name: flower.name,
					enabled: flower.enabled,
					...(flower.image ? { image: flower.image } : {}),
					kind,
				},
				kind.colors ? colors : [],
				flower.price,
				flower.colorImages,
			),
		];
	});
}

/** Fills in saved settings; flowers and wrappers come from their tables. */
export function withDefaults(
	saved: Partial<CustomBouquetSettings>,
	flowers: CustomFlowerOption[],
	wrappers: CustomWrapper[],
): CustomBouquetSettings {
	return {
		...DEFAULT_CUSTOM_SETTINGS,
		...saved,
		// Settings saved before money bouquets existed start with it switched off.
		money: saved.money ?? {
			...DEFAULT_CUSTOM_SETTINGS.money,
			enabled: !saved.saved,
		},
		flowers,
		wrappers,
	};
}

/** Every flower the shop knows, as set in Admin → Flowers. */
export function flowerKinds(settings?: CustomBouquetSettings): FlowerKind[] {
	if (!settings) return [...FLOWER_KINDS];
	return settings.flowers.map((option) => ({
		name: option.name,
		...(option.kind.colors ? { colors: true as const } : {}),
		...(option.kind.hint ? { hint: option.kind.hint } : {}),
	}));
}

/** Looks a flower up by name. */
export function findFlowerKind(name: string, settings?: CustomBouquetSettings) {
	return flowerKinds(settings).find((kind) => kind.name === name);
}

/** The colors shoppers choose from: the ones offered, for flowers with a choice. */
export function colorChoices(kind: FlowerKind, option?: CustomFlowerOption) {
	if (!kind.colors) return [];
	if (option) return option.colors.filter((c) => c.enabled).map((c) => c.name);
	return Array.isArray(kind.colors) ? [...kind.colors] : [];
}

/** Coerces untrusted data (localStorage, requests) into a design, or null. */
export function normalizeDesign(raw: unknown): CustomDesign | null {
	if (typeof raw !== "object" || raw === null) return null;
	const source = raw as Record<string, unknown>;
	if (typeof source.wrapperId !== "string" || !Array.isArray(source.items))
		return null;
	const items: RecipeItem[] = [];
	for (const entry of source.items) {
		if (typeof entry !== "object" || entry === null) continue;
		const { flower, color, count } = entry as Record<string, unknown>;
		if (typeof flower !== "string") continue;
		const item: RecipeItem = { flower };
		if (typeof color === "string" && color) item.color = color;
		if (typeof count === "number" && Number.isFinite(count))
			item.count = Math.floor(count);
		items.push(item);
	}
	const bills: BillCount[] = [];
	if (Array.isArray(source.bills)) {
		for (const entry of source.bills) {
			if (typeof entry !== "object" || entry === null) continue;
			const { value, count } = entry as Record<string, unknown>;
			if (typeof value !== "number" || typeof count !== "number") continue;
			if (!Number.isFinite(value) || !Number.isFinite(count)) continue;
			bills.push({ value, count: Math.floor(count) });
		}
	}
	return {
		items: items.slice(0, 40),
		...(bills.length ? { bills: bills.slice(0, PESO_BILLS.length) } : {}),
		wrapperId: source.wrapperId.slice(0, 40),
	};
}

/** Total cash value of the bills. */
export function cashTotal(bills: BillCount[] = []) {
	return bills.reduce((sum, bill) => sum + bill.value * bill.count, 0);
}

export function billCount(bills: BillCount[] = []) {
	return bills.reduce((sum, bill) => sum + bill.count, 0);
}

/** Same design, same id, so identical bouquets share one bag line. */
export function designKey(design: CustomDesign) {
	const canonical = JSON.stringify([
		design.wrapperId,
		[...design.items]
			.map((i) => [i.flower, i.color ?? "", i.count ?? 0])
			.sort((a, b) => String(a).localeCompare(String(b))),
		[...(design.bills ?? [])]
			.map((b) => [b.value, b.count])
			.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0)),
	]);
	let hash = 5381;
	for (let i = 0; i < canonical.length; i++)
		hash = ((hash * 33) ^ canonical.charCodeAt(i)) >>> 0;
	return `custom-${hash.toString(36)}`;
}

export interface PricedDesign {
	unitPrice: number;
	wrapper?: CustomWrapper;
	/** Most of this bouquet the flower stock can make; missing if not counted. */
	maxQuantity?: number;
	/** Why it can't be ordered as built, if anything. */
	problem?: string;
}

/** Checks the cash in a money bouquet; returns a problem, if any. */
function checkBills(
	bills: BillCount[],
	money: MoneySettings,
): string | undefined {
	if (bills.length === 0) return undefined;
	if (!money.enabled) return "Money bouquets aren’t available right now.";
	const seen = new Set<number>();
	for (const bill of bills) {
		if (!money.denominations.includes(bill.value))
			return `We can’t add ₱${bill.value} bills right now.`;
		if (seen.has(bill.value)) return `₱${bill.value} bills are listed twice.`;
		seen.add(bill.value);
		if (bill.count < 1) return `Choose how many ₱${bill.value} bills.`;
	}
	if (billCount(bills) > money.maxBills)
		return `A bouquet can hold up to ${money.maxBills} bills.`;
	return undefined;
}

/**
 * Prices a design from the shop's settings, never from client amounts, and
 * checks every flower, color and wrapper is still offered.
 */
export function priceDesign(
	design: CustomDesign,
	settings: CustomBouquetSettings,
): PricedDesign {
	if (!settings.enabled)
		return {
			unitPrice: 0,
			problem: "Custom bouquets aren’t available right now.",
		};
	const wrapper = settings.wrappers.find(
		(w) => w.id === design.wrapperId && w.enabled,
	);
	if (!wrapper)
		return { unitPrice: 0, problem: "Choose a wrapper that’s available." };
	if (!wrapperInStock(wrapper))
		return {
			unitPrice: 0,
			wrapper,
			problem: `The ${wrapper.name} wrapper is sold out. Edit it to pick another.`,
		};
	const bills = design.bills ?? [];
	if (design.items.length === 0 && bills.length === 0)
		return {
			unitPrice: 0,
			wrapper,
			problem: "Add at least one flower or some money.",
		};
	const billProblem = checkBills(bills, settings.money);
	if (billProblem) return { unitPrice: 0, wrapper, problem: billProblem };

	// Cash is charged at face value, plus the folding fee per bill.
	let total =
		settings.baseFee +
		wrapper.price +
		cashTotal(bills) +
		billCount(bills) * settings.money.feePerBill;
	const seen = new Set<string>();
	let maxQuantity: number | undefined;
	for (const item of design.items) {
		const kind = findFlowerKind(item.flower, settings);
		const option = settings.flowers.find((f) => f.name === item.flower);
		if (!kind || !option?.enabled)
			return {
				unitPrice: 0,
				wrapper,
				problem: `${item.flower} isn’t available right now.`,
			};
		const color = itemColor(option, item.color);
		if (!color?.enabled)
			return {
				unitPrice: 0,
				wrapper,
				problem: kind.colors
					? `Pick a color we have for ${item.flower}.`
					: `${item.flower} isn’t available right now.`,
			};
		const key = `${item.flower}::${color.name}`;
		if (seen.has(key))
			return {
				unitPrice: 0,
				wrapper,
				problem: `${item.flower} is listed twice.`,
			};
		seen.add(key);
		if (!item.count || item.count < 1 || item.count > MAX_STEMS_PER_FLOWER)
			return {
				unitPrice: 0,
				wrapper,
				problem: `Choose 1–${MAX_STEMS_PER_FLOWER} ${item.flower}.`,
			};
		const label = kind.colors ? `${color.name} ${item.flower}` : item.flower;
		if (!colorInStock(color, itemUnits(item)))
			return {
				unitPrice: 0,
				wrapper,
				problem: color.stock
					? `Only ${color.stock} ${label} left. Choose fewer.`
					: `${label} is sold out.`,
			};
		if (color.stock !== undefined)
			maxQuantity = Math.min(
				maxQuantity ?? Number.POSITIVE_INFINITY,
				Math.floor(color.stock / itemUnits(item)),
			);
		total += color.price * itemUnits(item);
	}
	return {
		unitPrice: Math.round(total * 100) / 100,
		wrapper,
		...(maxQuantity === undefined ? {} : { maxQuantity }),
	};
}

/** "10 × ₱100, 2 × ₱500" for showing the cash in a bouquet. */
export function formatBills(bills: BillCount[] = []) {
	return bills
		.map((bill) => `${bill.count} × ₱${bill.value.toLocaleString("en-PH")}`)
		.join(", ");
}
