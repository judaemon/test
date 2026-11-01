import {
	CUSTOM_IMAGE,
	CUSTOM_PRODUCT_ID,
	type CustomBouquetSettings,
	type CustomDesign,
	designKey,
	normalizeDesign,
	priceDesign,
} from "~/lib/custom-bouquet";
import { getMaxQuantity, getVariantPrice, MAX_PER_ORDER } from "~/lib/product";
import type { Product, ProductVariant, RecipeItem } from "~/types/product";

export interface CartLine {
	productId: string;
	variantId: string;
	quantity: number;
	/** Set on built bouquets (productId `CUSTOM_PRODUCT_ID`). */
	custom?: CustomDesign;
}

export interface PricedLine {
	productId: string;
	variantId: string;
	title: string;
	colorName: string;
	colorHex?: string;
	colorHex2?: string;
	sku: string;
	image?: string;
	/** Snapshot of the bouquet's recipe; missing on orders placed before recipes. */
	recipe?: RecipeItem[];
	wrapperColor?: string;
	/** The design, for built bouquets, so they can be ordered again. */
	custom?: CustomDesign;
	quantity: number;
	unitPrice: number;
	lineTotal: number;
	maxQuantity: number;
	/**
	 * Why this line can't be ordered as-is, if anything: `sold-out` is a
	 * bouquet style marked not available, `over-stock` more than one order
	 * (or the custom bouquet's stock) allows, `unavailable` a custom bouquet
	 * that can't be made as built.
	 */
	problem?: "sold-out" | "over-stock" | "unavailable";
	/** Shopper-facing reason, for `unavailable`. */
	problemText?: string;
}

export interface PricedCart {
	lines: PricedLine[];
	subtotal: number;
	deliveryFee: number;
	total: number;
	currency: string;
	itemCount: number;
}

/** Same-day delivery is free on every order. */
export const DELIVERY_FEE = 0;
const DEFAULT_CURRENCY = "PHP";

export function findVariant(
	catalog: Product[],
	productId: string,
	variantId: string,
): { product: Product; variant: ProductVariant } | undefined {
	const product = catalog.find((p) => p.id === productId);
	const variant = product?.variants.find((v) => v.id === variantId);
	return product && variant ? { product, variant } : undefined;
}

/**
 * Prices a bag from the catalog and the builder's settings, never from
 * client-supplied amounts. Shared by the cart drawer and the server-side
 * order handler so totals always agree. Lines for products that no longer
 * exist are dropped.
 */
export function priceCart(
	lines: CartLine[],
	catalog: Product[],
	custom?: CustomBouquetSettings,
): PricedCart {
	const priced: PricedLine[] = [];
	let currency = DEFAULT_CURRENCY;

	for (const line of lines) {
		if (line.productId === CUSTOM_PRODUCT_ID) {
			if (!line.custom || !custom) continue;
			priced.push(priceCustomLine(line, line.custom, custom));
			continue;
		}
		const match = findVariant(catalog, line.productId, line.variantId);
		if (!match) continue;
		const { product, variant } = match;
		currency = product.currency;
		const unitPrice = getVariantPrice(product, variant);
		const maxQuantity = getMaxQuantity(variant);
		priced.push({
			productId: product.id,
			variantId: variant.id,
			title: product.title,
			colorName: variant.colorName,
			colorHex: variant.colorHex,
			colorHex2: variant.colorHex2,
			sku: variant.sku,
			image: variant.images[0],
			recipe: variant.recipe,
			wrapperColor: variant.wrapperColor,
			quantity: line.quantity,
			unitPrice,
			lineTotal: roundMoney(unitPrice * line.quantity),
			maxQuantity,
			problem:
				maxQuantity === 0
					? "sold-out"
					: line.quantity > maxQuantity
						? "over-stock"
						: undefined,
		});
	}

	const subtotal = roundMoney(priced.reduce((sum, l) => sum + l.lineTotal, 0));
	const deliveryFee = priced.length > 0 ? DELIVERY_FEE : 0;
	return {
		lines: priced,
		subtotal,
		deliveryFee,
		total: roundMoney(subtotal + deliveryFee),
		currency,
		itemCount: priced.reduce((sum, l) => sum + l.quantity, 0),
	};
}

/** A built bouquet: made to order, limited by the wrappers and flowers left. */
function priceCustomLine(
	line: CartLine,
	design: CustomDesign,
	settings: CustomBouquetSettings,
): PricedLine {
	const priced = priceDesign(design, settings);
	const { unitPrice, wrapper, problem } = priced;
	const maxQuantity = Math.min(
		MAX_PER_ORDER,
		wrapper?.stock ?? MAX_PER_ORDER,
		priced.maxQuantity ?? MAX_PER_ORDER,
	);
	return {
		productId: CUSTOM_PRODUCT_ID,
		variantId: line.variantId,
		title: design.bills?.length ? "Money bouquet" : "Custom bouquet",
		colorName: wrapper ? `${wrapper.name} wrapper` : "Custom",
		colorHex: wrapper?.colorHex,
		sku: "Custom",
		image: CUSTOM_IMAGE,
		recipe: design.items,
		wrapperColor: wrapper?.name,
		custom: design,
		quantity: line.quantity,
		unitPrice,
		lineTotal: roundMoney(unitPrice * line.quantity),
		maxQuantity,
		problem: problem
			? "unavailable"
			: line.quantity > maxQuantity
				? "over-stock"
				: undefined,
		problemText: problem,
	};
}

/**
 * Coerces untrusted data (localStorage, request bodies) into valid cart lines:
 * drops malformed entries, merges duplicates and clamps quantities to 1–99.
 */
export function sanitizeCartLines(raw: unknown): CartLine[] {
	if (!Array.isArray(raw)) return [];
	const merged = new Map<string, CartLine>();
	for (const entry of raw) {
		if (typeof entry !== "object" || entry === null) continue;
		const source = entry as Record<string, unknown>;
		const { productId, quantity } = source;
		let { variantId } = source;
		if (typeof productId !== "string") continue;
		if (typeof quantity !== "number" || !Number.isFinite(quantity)) continue;
		let custom: CustomDesign | undefined;
		if (productId === CUSTOM_PRODUCT_ID) {
			custom = normalizeDesign(source.custom) ?? undefined;
			if (!custom) continue;
			// The id always follows the design, so it can't be spoofed.
			variantId = designKey(custom);
		}
		if (typeof variantId !== "string") continue;
		const qty = Math.floor(quantity);
		if (qty < 1) continue;
		const key = `${productId}::${variantId}`;
		const existing = merged.get(key);
		merged.set(key, {
			productId,
			variantId,
			quantity: Math.min(99, (existing?.quantity ?? 0) + qty),
			...(custom ? { custom } : {}),
		});
	}
	return [...merged.values()];
}

function roundMoney(amount: number) {
	return Math.round(amount * 100) / 100;
}
