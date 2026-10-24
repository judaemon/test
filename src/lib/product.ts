import type { Product, ProductVariant } from "~/types/product";

export const LOW_STOCK_THRESHOLD = 5;

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
	return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
		amount,
	);
}
