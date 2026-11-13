import { lineKey } from "~/lib/bouquet-messages";
import type { OrderActor } from "~/lib/order-log";
import type { Order } from "~/types/order";
import type { RecipeItem } from "~/types/product";
import { listAdminProducts } from "./catalog-repo";
import { type StyleNow, syncOrderRecipes } from "./orders-repo";

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
	const styles = new Map<string, StyleNow>();
	for (const product of listAdminProducts()) {
		if (productIds && !productIds.includes(product.id)) continue;
		for (const variant of product.variants)
			styles.set(lineKey({ productId: product.id, variantId: variant.id }), {
				recipe: variant.recipe,
				wrapperColor: variant.wrapperColor ?? "",
			});
	}
	return syncOrderRecipes(styles, actor);
}

/**
 * Orders with their open bouquets (new or being made) on their style as it is
 * now, for the lists: the flowers, and the wrapper. A bouquet ordered before
 * its style changed (or before a wrapper was renamed) shows as the latest
 * version, so it's counted and grouped with the rest, even where saving the
 * change didn't reach the order. Done and cancelled orders keep what they were
 * made with; custom bouquets and styles since deleted keep their own. Nothing
 * is saved. Off along with `SYNC_ORDER_RECIPES`.
 */
export function withLatestRecipes<T extends Order>(orders: T[]): T[] {
	if (!SYNC_ORDER_RECIPES) return orders;
	const styles = new Map<string, { recipe: RecipeItem[]; wrapper: string }>();
	for (const product of listAdminProducts())
		for (const variant of product.variants)
			styles.set(lineKey({ productId: product.id, variantId: variant.id }), {
				recipe: variant.recipe,
				wrapper: variant.wrapperColor ?? "",
			});
	return orders.map((order) =>
		order.stage !== "new" && order.stage !== "making"
			? order
			: {
					...order,
					lines: order.lines.map((line) => {
						const style = styles.get(lineKey(line));
						if (!style) return line;
						return {
							...line,
							...(style.recipe.length ? { recipe: style.recipe } : {}),
							...(style.wrapper ? { wrapperColor: style.wrapper } : {}),
						};
					}),
				},
	);
}
