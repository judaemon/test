import { addToCart } from "~/lib/cart-store";
import { findVariant, type PricedLine } from "~/lib/pricing";
import { getMaxQuantity } from "~/lib/product";
import type { Product } from "~/types/product";

export interface ReorderResult {
	/** Units put in the bag. */
	added: number;
	/** Colors that are gone, sold out or only partly available. */
	unavailable: string[];
}

/**
 * Copies a past order's bouquets into the bag at today's prices, respecting
 * current stock. Anything no longer sold is reported rather than added.
 */
export function reorderToCart(
	lines: PricedLine[],
	catalog: Product[],
): ReorderResult {
	let added = 0;
	const unavailable: string[] = [];
	for (const line of lines) {
		const match = findVariant(catalog, line.productId, line.variantId);
		if (!match?.variant.inStock) {
			unavailable.push(line.colorName);
			continue;
		}
		const units = addToCart(
			{
				productId: line.productId,
				variantId: line.variantId,
				quantity: line.quantity,
			},
			getMaxQuantity(match.variant),
		);
		added += units;
		if (units < line.quantity) unavailable.push(line.colorName);
	}
	return { added, unavailable };
}
