import { lineKey } from "~/lib/bouquet-messages";
import type { OrderActor } from "~/lib/order-log";
import type { RecipeItem } from "~/types/product";
import { listAdminProducts } from "./catalog-repo";
import { syncOrderRecipes } from "./orders-repo";

/**
 * For now, while the arrangements' flowers are still being filled in: when
 * an arrangement's flowers change, its bouquets on open orders follow, so
 * the flower report and florist sheets show what's really made.
 *
 * Orders normally keep the flowers they were ordered with. Set this to false
 * once the recipes are settled, and orders go back to keeping their own.
 */
export const SYNC_ORDER_RECIPES = true;

/**
 * Brings open orders' bouquets up to date with their arrangements' flowers:
 * every arrangement, or only the ones named. Does nothing once switched off.
 */
export function syncOrderRecipesFromCatalog(
	actor: OrderActor,
	productIds?: readonly string[],
) {
	if (!SYNC_ORDER_RECIPES) return { orders: 0, bouquets: 0 };
	const recipes = new Map<string, RecipeItem[]>();
	for (const product of listAdminProducts()) {
		if (productIds && !productIds.includes(product.id)) continue;
		for (const variant of product.variants)
			recipes.set(
				lineKey({ productId: product.id, variantId: variant.id }),
				variant.recipe,
			);
	}
	return syncOrderRecipes(recipes, actor);
}
