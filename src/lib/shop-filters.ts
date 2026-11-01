import type { Product } from "~/types/product";

/** The landing page's filters, kept in the address so a view can be shared. */
export interface ShopFilters {
	/** Flowers' keys, comma-separated, e.g. "roses,white-lily". */
	flower?: string;
	/** Sizes' ids, comma-separated, e.g. "petite,classic". */
	size?: string;
}

/** "roses,tulips" → ["roses", "tulips"]. */
export const parseList = (value?: string) =>
	(value ?? "").split(",").filter(Boolean);

/** The other way round; missing when nothing's chosen. */
export const joinList = (values: string[]) =>
	values.length ? values.join(",") : undefined;

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
			? (search[key] as string).slice(0, 400)
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
