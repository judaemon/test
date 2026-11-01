import { addToCart } from "~/lib/cart-store";
import { CUSTOM_PRODUCT_ID, designKey } from "~/lib/custom-bouquet";
import { findVariant, type PricedLine } from "~/lib/pricing";
import { getMaxQuantity, MAX_PER_ORDER } from "~/lib/product";
import type { Product } from "~/types/product";

export interface ReorderResult {
	/** Units put in the bag. */
	added: number;
	/** Styles that are gone, not available or only partly added. */
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
		// Built bouquets go back in as designed; the bag re-prices them and
		// flags any flower or wrapper that's no longer offered.
		if (line.custom) {
			added += addToCart(
				{
					productId: CUSTOM_PRODUCT_ID,
					variantId: designKey(line.custom),
					quantity: line.quantity,
					custom: line.custom,
				},
				MAX_PER_ORDER,
			);
			continue;
		}
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
