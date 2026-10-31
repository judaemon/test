import { FLOWER_KINDS, type FlowerKind } from "~/lib/flowers";
import type { RecipeItem } from "~/types/product";

/** Cart and order lines for built bouquets use this in place of a product id. */
export const CUSTOM_PRODUCT_ID = "_custom";
export const CUSTOM_IMAGE = "/images/bouquets/custom.svg";
/** Most stems of one flower and color in a single bouquet. */
export const MAX_STEMS_PER_FLOWER = 100;

/** What sort of flower it is; staff can edit this for every flower. */
export interface FlowerKindSettings {
	/** Counted per stem, or added as a cluster. */
	counted: boolean;
	/** Comes in colors (listed in `colors`). */
	colors: boolean;
	/** Short note shown with the name, e.g. "big yellow chrysanthemum". */
	hint?: string;
}

export interface CustomFlowerOption {
	name: string;
	enabled: boolean;
	/** Per stem for counted flowers, per cluster for fillers. */
	price: number;
	/** Colors shoppers can pick, for flowers that come in colors. */
	colors: string[];
	/** Photo of the flower, shown beside it in recipes; empty if none. */
	image?: string;
	/** Photos of particular colors (keyed by color name); `image` covers the rest. */
	colorImages?: Record<string, string>;
	kind: FlowerKindSettings;
}

/** The photo for a flower in a given color, falling back to its main photo. */
export function flowerPhoto(
	option: CustomFlowerOption | undefined,
	color?: string,
): string | undefined {
	if (!option) return undefined;
	const wanted = color?.trim().toLowerCase();
	if (wanted && option.colorImages) {
		for (const [name, src] of Object.entries(option.colorImages))
			if (src && name.toLowerCase() === wanted) return src;
	}
	return option.image || undefined;
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
	flowers: FLOWER_KINDS.map((kind) => ({
		name: kind.name,
		enabled: true,
		price: SAMPLE_PRICES[kind.name] ?? 150,
		colors: startingColors(kind),
		kind: kindSettings(kind),
	})),
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
		counted: kind.counted,
		colors: !!kind.colors,
		...(kind.hint ? { hint: kind.hint } : {}),
	};
}

/** A built-in flower's starting colors: its fixed choices, or the samples. */
function startingColors(kind: FlowerKind): string[] {
	if (Array.isArray(kind.colors)) return [...kind.colors];
	return kind.colors === true ? (SAMPLE_COLORS[kind.name] ?? []) : [];
}

/**
 * Fills in saved settings. The saved flower list is the shop's list (staff can
 * edit, add and remove any flower); flowers saved before they could be edited
 * get their kind from the built-in list.
 */
export function withAllFlowers(
	saved: Partial<CustomBouquetSettings>,
): CustomBouquetSettings {
	const flowers = saved.flowers
		? saved.flowers.flatMap((flower): CustomFlowerOption[] => {
				if (flower.kind) return [flower];
				const builtIn = FLOWER_KINDS.find((k) => k.name === flower.name);
				if (!builtIn) return [];
				return [
					{
						...flower,
						kind: kindSettings(builtIn),
						colors: flower.colors.length
							? flower.colors
							: Array.isArray(builtIn.colors)
								? [...builtIn.colors]
								: [],
					},
				];
			})
		: DEFAULT_CUSTOM_SETTINGS.flowers;
	return {
		...DEFAULT_CUSTOM_SETTINGS,
		...saved,
		// Settings saved before money bouquets existed start with it switched off.
		money: saved.money ?? {
			...DEFAULT_CUSTOM_SETTINGS.money,
			enabled: !saved.saved,
		},
		flowers,
	};
}

/** Every flower the shop knows, as set in Admin → Custom bouquets. */
export function flowerKinds(settings?: CustomBouquetSettings): FlowerKind[] {
	if (!settings) return [...FLOWER_KINDS];
	return settings.flowers.map((option) => ({
		name: option.name,
		counted: option.kind.counted,
		...(option.kind.colors ? { colors: true as const } : {}),
		...(option.kind.hint ? { hint: option.kind.hint } : {}),
	}));
}

/** Looks a flower up by name. */
export function findFlowerKind(name: string, settings?: CustomBouquetSettings) {
	return flowerKinds(settings).find((kind) => kind.name === name);
}

/** The colors shoppers choose from, as listed by staff. */
export function colorChoices(kind: FlowerKind, option?: CustomFlowerOption) {
	if (!kind.colors) return [];
	if (option) return option.colors;
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
	for (const item of design.items) {
		const kind = findFlowerKind(item.flower, settings);
		const option = settings.flowers.find((f) => f.name === item.flower);
		if (!kind || !option?.enabled)
			return {
				unitPrice: 0,
				wrapper,
				problem: `${item.flower} isn’t available right now.`,
			};
		const colors = colorChoices(kind, option);
		if (
			colors.length > 0
				? !item.color || !colors.includes(item.color)
				: item.color
		)
			return {
				unitPrice: 0,
				wrapper,
				problem: `Pick a color we have for ${item.flower}.`,
			};
		const key = `${item.flower}::${item.color ?? ""}`;
		if (seen.has(key))
			return {
				unitPrice: 0,
				wrapper,
				problem: `${item.flower} is listed twice.`,
			};
		seen.add(key);
		if (kind.counted) {
			if (!item.count || item.count < 1 || item.count > MAX_STEMS_PER_FLOWER)
				return {
					unitPrice: 0,
					wrapper,
					problem: `Choose 1–${MAX_STEMS_PER_FLOWER} ${item.flower}.`,
				};
			total += option.price * item.count;
		} else {
			if (item.count !== undefined)
				return {
					unitPrice: 0,
					wrapper,
					problem: `${item.flower} comes as one cluster.`,
				};
			total += option.price;
		}
	}
	// Fillers alone don't make a bouquet; it needs counted flowers or cash.
	if (
		bills.length === 0 &&
		!design.items.some((item) => findFlowerKind(item.flower, settings)?.counted)
	)
		return {
			unitPrice: 0,
			wrapper,
			problem: "Add at least one counted flower, like Roses, or some money.",
		};
	return { unitPrice: Math.round(total * 100) / 100, wrapper };
}

/** "10 × ₱100, 2 × ₱500" for showing the cash in a bouquet. */
export function formatBills(bills: BillCount[] = []) {
	return bills
		.map((bill) => `${bill.count} × ₱${bill.value.toLocaleString("en-PH")}`)
		.join(", ");
}
