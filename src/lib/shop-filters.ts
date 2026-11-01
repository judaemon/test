import type { Product } from "~/types/product";

/** The landing page's filters, kept in the address so a view can be shared. */
export interface ShopFilters {
	/** A flower's key, e.g. "roses" or "white-lily". */
	flower?: string;
	/** A size's id, e.g. "petite". */
	size?: string;
}

/** "White lily" → "white-lily", for the address. */
export const filterKey = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export function validateShopFilters(
	search: Record<string, unknown>,
): ShopFilters {
	const value = (key: string) =>
		typeof search[key] === "string" && search[key]
			? (search[key] as string).slice(0, 60)
			: undefined;
	return { flower: value("flower"), size: value("size") };
}

/** Every flower in any of a bouquet's themes, by name. */
export function bouquetFlowers(product: Product) {
	return [
		...new Set(
			product.variants.flatMap((variant) =>
				variant.recipe.map((item) => item.flower),
			),
		),
	];
}
