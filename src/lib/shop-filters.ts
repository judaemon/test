import type { Product, ProductVariant } from "~/types/product";

/** The landing page's filters, kept in the address so a view can be shared. */
export interface ShopFilters {
	/** Part of a bouquet's name. */
	q?: string;
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
	// The router reads an all-digit value as a number.
	const q = typeof search.q === "number" ? String(search.q) : search.q;
	return {
		q: typeof q === "string" && q.trim() ? q.trim().slice(0, 120) : undefined,
		flower: value("flower"),
		size: value("size"),
	};
}

/** Whether a bouquet's name has the search in it; any case. */
export const nameMatches = (title: string, query: string) =>
	title.toLowerCase().includes(query.trim().toLowerCase());

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

/**
 * Other bouquets to suggest, each on its first available theme: those sharing
 * the most flowers first, then the same size, then the shop's order.
 */
export function relatedBouquets(
	product: Product,
	catalog: Product[],
	limit = 5,
): { product: Product; variant: ProductVariant }[] {
	const flowers = new Set(bouquetFlowers(product));
	const shared = (other: Product) =>
		bouquetFlowers(other).filter((flower) => flowers.has(flower)).length;
	const sameSize = (other: Product) => (other.size === product.size ? 1 : 0);
	return catalog
		.filter((other) => other.id !== product.id && other.variants.length > 0)
		.sort((a, b) => shared(b) - shared(a) || sameSize(b) - sameSize(a))
		.slice(0, limit)
		.map((other) => ({
			product: other,
			variant:
				other.variants.find((variant) => variant.inStock) ?? other.variants[0],
		}));
}
