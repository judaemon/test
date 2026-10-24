import { getProduct } from "~/data/products";
import { getMaxQuantity, getVariantPrice } from "~/lib/product";
import type { Product, ProductVariant } from "~/types/product";

export interface CartLine {
	productId: string;
	variantId: string;
	quantity: number;
}

export interface PricedLine {
	productId: string;
	variantId: string;
	title: string;
	colorName: string;
	colorHex?: string;
	sku: string;
	image?: string;
	quantity: number;
	unitPrice: number;
	lineTotal: number;
	maxQuantity: number;
	/** Why this line can't be ordered as-is, if anything. */
	problem?: "sold-out" | "over-stock";
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
	productId: string,
	variantId: string,
): { product: Product; variant: ProductVariant } | undefined {
	const product = getProduct(productId);
	const variant = product?.variants.find((v) => v.id === variantId);
	return product && variant ? { product, variant } : undefined;
}

/**
 * Prices a bag from the catalog, never from client-supplied amounts. Shared by
 * the cart drawer and the server-side order handler so totals always agree.
 * Lines for products that no longer exist are dropped.
 */
export function priceCart(lines: CartLine[]): PricedCart {
	const priced: PricedLine[] = [];
	let currency = DEFAULT_CURRENCY;

	for (const line of lines) {
		const match = findVariant(line.productId, line.variantId);
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
			sku: variant.sku,
			image: variant.images[0],
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

/**
 * Coerces untrusted data (localStorage, request bodies) into valid cart lines:
 * drops malformed entries, merges duplicates and clamps quantities to 1–99.
 */
export function sanitizeCartLines(raw: unknown): CartLine[] {
	if (!Array.isArray(raw)) return [];
	const merged = new Map<string, CartLine>();
	for (const entry of raw) {
		if (typeof entry !== "object" || entry === null) continue;
		const { productId, variantId, quantity } = entry as Record<string, unknown>;
		if (typeof productId !== "string" || typeof variantId !== "string")
			continue;
		if (typeof quantity !== "number" || !Number.isFinite(quantity)) continue;
		const qty = Math.floor(quantity);
		if (qty < 1) continue;
		const key = `${productId}::${variantId}`;
		const existing = merged.get(key);
		merged.set(key, {
			productId,
			variantId,
			quantity: Math.min(99, (existing?.quantity ?? 0) + qty),
		});
	}
	return [...merged.values()];
}

function roundMoney(amount: number) {
	return Math.round(amount * 100) / 100;
}
