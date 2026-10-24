import type { Product, ProductVariant } from "~/types/product";

export const LOW_STOCK_THRESHOLD = 5;
export const MAX_PER_ORDER = 10;

/** Most units of a variant one bag may hold; 0 when it can't be bought. */
export function getMaxQuantity(variant: ProductVariant) {
	if (!variant.inStock) return 0;
	return Math.min(MAX_PER_ORDER, variant.stockQuantity ?? MAX_PER_ORDER);
}

export function getVariantPrice(product: Product, variant: ProductVariant) {
	return variant.price ?? product.basePrice;
}

/**
 * Resolves the variant named in the URL. Unknown or missing ids fall back to
 * the first in-stock variant so a stale shared link still lands somewhere
 * useful.
 */
export function resolveVariant(
	product: Product,
	variantId: string | undefined,
): ProductVariant {
	return (
		product.variants.find((variant) => variant.id === variantId) ??
		product.variants.find((variant) => variant.inStock) ??
		product.variants[0]
	);
}

export type StockStatus = "in-stock" | "low-stock" | "out-of-stock";

export function getStockStatus(variant: ProductVariant): StockStatus {
	if (!variant.inStock) return "out-of-stock";
	if (
		variant.stockQuantity !== undefined &&
		variant.stockQuantity <= LOW_STOCK_THRESHOLD
	)
		return "low-stock";
	return "in-stock";
}

export function formatPrice(amount: number, currency: string) {
	// Whole amounts read cleaner without centavos: ₱2,999 rather than ₱2,999.00.
	const fractionDigits = Number.isInteger(amount) ? 0 : 2;
	return new Intl.NumberFormat("en-PH", {
		style: "currency",
		currency,
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(amount);
}
