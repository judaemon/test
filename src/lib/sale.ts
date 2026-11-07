import { CUSTOM_PRODUCT_ID } from "~/lib/custom-bouquet";
import { formatPrice } from "~/lib/product";

/** Shop days run on Manila time; a sale's dates are whole days there. */
const SHOP_ZONE = "Asia/Manila";

export const SALE_KINDS = ["percent", "amount"] as const;
export type SaleKind = (typeof SALE_KINDS)[number];

export const SALE_SCOPES = ["all", "selected"] as const;
export type SaleScope = (typeof SALE_SCOPES)[number];

/** Biggest percent a sale can take off, so a typo can't give bouquets away. */
export const SALE_PERCENT_MAX = 90;
export const SALE_NAME_MAX = 60;

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
	sale: PublicSale,
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
 * The best of the live sales for an item (sales don't add up): its new price
 * and the sale, or undefined when none covers it or none lowers the price.
 */
export function bestSale(
	price: number,
	item: { productId: string; arrangement?: string },
	sales: readonly PublicSale[],
): { price: number; sale: PublicSale } | undefined {
	let best: { price: number; sale: PublicSale } | undefined;
	for (const sale of sales) {
		if (!saleCovers(sale, item)) continue;
		const reduced = salePrice(price, sale);
		if (reduced < price && (!best || reduced < best.price))
			best = { price: reduced, sale };
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
