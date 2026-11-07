import { CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import { formatPrice } from "~/lib/product";

/** Shop days run on Manila time; a sale's dates are whole days there. */
const SHOP_ZONE = "Asia/Manila";

export const SALE_KINDS = ["percent", "amount"] as const;
export type SaleKind = (typeof SALE_KINDS)[number];

/**
 * How a sale shows its discount. `discount` lowers the price. `markup` keeps
 * the price and shows a higher "before" price that the discount brings down
 * to it, the way marketplace sellers do.
 */
export const SALE_PRICINGS = ["discount", "markup"] as const;
export type SalePricing = (typeof SALE_PRICINGS)[number];

export const SALE_SCOPES = ["all", "selected"] as const;
export type SaleScope = (typeof SALE_SCOPES)[number];

/** Biggest percent a sale can take off, so a typo can't give bouquets away. */
export const SALE_PERCENT_MAX = 90;
export const SALE_NAME_MAX = 60;

/**
 * What a sale or order promo is on: everything, or chosen arrangement types,
 * arrangements and custom bouquets.
 */
export interface ItemScope {
	scope: SaleScope;
	/** With `selected`: every arrangement of these types… */
	arrangementTypes: string[];
	/** …these arrangements (by id)… */
	products: string[];
	/** …and bouquets built in the builder. */
	includeCustom: boolean;
}

/**
 * A sale staff set up in Admin → Sales: a percent or an amount off each item,
 * from one day to another (Manila time, both days included), on everything or
 * on chosen arrangement types, arrangements and custom bouquets.
 */
export interface Sale {
	id: string;
	/** Shown to shoppers, e.g. "November Sale". */
	name: string;
	kind: SaleKind;
	/** Percent off (1–90), or pesos off each item. */
	value: number;
	pricing: SalePricing;
	/** First day, `YYYY-MM-DD`. */
	startsOn: string;
	/** Last day, `YYYY-MM-DD`. */
	endsOn: string;
	/** Staff can switch a sale off without deleting it. */
	enabled: boolean;
	scope: SaleScope;
	/** With `selected`: every arrangement of these types… */
	arrangementTypes: string[];
	/** …these arrangements (by id)… */
	products: string[];
	/** …and bouquets built in the builder. */
	includeCustom: boolean;
}

/** What the shop is told about a live sale. */
export type PublicSale = Omit<Sale, "enabled">;

/** The sale a bouquet in a bag or order got, kept with it once ordered. */
export interface LineSale {
	id: string;
	name: string;
	/** e.g. "5% off", "₱100 off". */
	label: string;
}

/** Today's date in Manila, `YYYY-MM-DD`. */
export function shopToday(now = new Date()) {
	return now.toLocaleDateString("en-CA", { timeZone: SHOP_ZONE });
}

export type SaleStatus = "off" | "scheduled" | "live" | "ended";

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
	off: "Off",
	scheduled: "Scheduled",
	live: "Live",
	ended: "Ended",
};

export function saleStatus(
	sale: Pick<Sale, "enabled" | "startsOn" | "endsOn">,
	today = shopToday(),
): SaleStatus {
	if (!sale.enabled) return "off";
	if (today < sale.startsOn) return "scheduled";
	if (today > sale.endsOn) return "ended";
	return "live";
}

export function saleLabel(sale: Pick<Sale, "kind" | "value">) {
	return sale.kind === "percent"
		? `${sale.value}% off`
		: `${formatPrice(sale.value, "PHP")} off`;
}

/** Whether a sale covers an item: an arrangement, or a custom bouquet. */
export function saleCovers(
	sale: ItemScope,
	item: { productId: string; arrangement?: string },
) {
	if (sale.scope === "all") return true;
	if (item.productId === CUSTOM_PRODUCT_ID) return sale.includeCustom;
	return (
		sale.products.includes(item.productId) ||
		(!!item.arrangement && sale.arrangementTypes.includes(item.arrangement))
	);
}

/**
 * The price after a sale, in whole pesos, rounded down so shoppers always get
 * at least the discount; never below zero.
 */
export function salePrice(price: number, sale: Pick<Sale, "kind" | "value">) {
	const off = sale.kind === "percent" ? (price * sale.value) / 100 : sale.value;
	return Math.max(0, Math.floor(price - off));
}

/**
 * The "before" price a markup sale shows: the one its discount brings down to
 * the real price. 5% off ₱1,053 is ₱1,000 (₱1,050 would give ₱997.50), and
 * ₱100 off ₱1,100 is ₱1,000. Whole pesos, rounded up.
 */
export function markupPrice(price: number, sale: Pick<Sale, "kind" | "value">) {
	return sale.kind === "percent"
		? Math.ceil((price * 100) / (100 - sale.value))
		: price + sale.value;
}

/** What an item costs with a sale, and the struck-through price it shows. */
export function applySale(
	price: number,
	sale: Pick<Sale, "kind" | "value" | "pricing">,
) {
	return sale.pricing === "markup"
		? { price, original: markupPrice(price, sale) }
		: { price: salePrice(price, sale), original: price };
}

/**
 * The best of the live sales for an item (sales don't add up): the lowest
 * price wins, then the bigger "before" price. Undefined when none covers it.
 */
export function bestSale(
	price: number,
	item: { productId: string; arrangement?: string },
	sales: readonly PublicSale[],
): { price: number; original: number; sale: PublicSale } | undefined {
	let best: { price: number; original: number; sale: PublicSale } | undefined;
	for (const sale of sales) {
		if (!saleCovers(sale, item)) continue;
		const result = applySale(price, sale);
		if (result.original <= result.price) continue;
		if (
			!best ||
			result.price < best.price ||
			(result.price === best.price && result.original > best.original)
		)
			best = { ...result, sale };
	}
	return best;
}

export const lineSale = (sale: PublicSale): LineSale => ({
	id: sale.id,
	name: sale.name,
	label: saleLabel(sale),
});

/** How much the sale took off a bag's or order's bouquets. */
export function savings(
	lines: readonly {
		originalUnitPrice?: number;
		unitPrice: number;
		quantity: number;
	}[],
) {
	const cents = lines.reduce(
		(sum, line) =>
			sum +
			Math.round(
				((line.originalUnitPrice ?? line.unitPrice) - line.unitPrice) * 100,
			) *
				line.quantity,
		0,
	);
	return cents / 100;
}

/** "Ends today", "Ends tomorrow", or "Ends Nov 9". */
export function saleEndsText(endsOn: string, today = shopToday()) {
	if (endsOn === today) return "Ends today";
	const tomorrow = new Date(`${today}T00:00:00Z`);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	if (endsOn === tomorrow.toISOString().slice(0, 10)) return "Ends tomorrow";
	return `Ends ${new Date(`${endsOn}T00:00:00Z`).toLocaleDateString("en-PH", {
		timeZone: "UTC",
		month: "short",
		day: "numeric",
	})}`;
}
