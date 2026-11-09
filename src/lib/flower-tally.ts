import type { RecipeItem } from "~/types/product";

/** One flower an order needs, its bouquets' quantities counted in. */
export interface OrderFlower {
	flower: string;
	/** "" for flowers that don't come in colors. */
	color: string;
	filler: boolean;
	/** Stems, counting how many of each bouquet were ordered. */
	stems: number;
	/** Old filler items that came as one cluster, with no count. */
	clusters: number;
	/** Bouquets in the order that use it. */
	bouquets: number;
}

/** Names one flower and color (filler apart), e.g. for its bought status. */
export const flowerKey = (item: {
	flower: string;
	color?: string;
	filler?: boolean;
}) => [item.flower, item.color ?? "", item.filler ? "f" : ""].join("|");
const keyOf = flowerKey;

/**
 * The flowers an order's bouquets need, from the recipe each line was ordered
 * with. Bouquets without one (from before recipes) are counted in `missing`.
 */
export function orderFlowers(
	lines: readonly { quantity: number; recipe?: RecipeItem[] }[],
) {
	const flowers = new Map<string, OrderFlower>();
	let missing = 0;
	for (const line of lines) {
		if (!line.recipe?.length) {
			missing += line.quantity;
			continue;
		}
		const seen = new Set<string>();
		for (const item of line.recipe) {
			const key = keyOf(item);
			const row = flowers.get(key) ?? {
				flower: item.flower,
				color: item.color ?? "",
				filler: item.filler === true,
				stems: 0,
				clusters: 0,
				bouquets: 0,
			};
			if (item.count) row.stems += item.count * line.quantity;
			else row.clusters += line.quantity;
			if (!seen.has(key)) {
				seen.add(key);
				row.bouquets += line.quantity;
			}
			flowers.set(key, row);
		}
	}
	return { flowers: [...flowers.values()], missing };
}

/** One flower and color across orders, with the orders that need it. */
export interface FlowerTallyRow extends OrderFlower {
	orderIds: string[];
}

/** A flower across orders: its total, then each color. */
export interface FlowerTally {
	flower: string;
	filler: boolean;
	stems: number;
	clusters: number;
	orderIds: string[];
	colors: FlowerTallyRow[];
}

/**
 * Adds up what orders need, by flower and then color. Flowers with the most
 * stems come first; fillers after the main flowers.
 */
export function tallyFlowers(
	orders: readonly { id: string; flowers: readonly OrderFlower[] }[],
): FlowerTally[] {
	const byFlower = new Map<string, FlowerTally>();
	for (const order of orders) {
		for (const item of order.flowers) {
			const flowerKey = `${item.flower}|${item.filler ? "f" : ""}`;
			const flower = byFlower.get(flowerKey) ?? {
				flower: item.flower,
				filler: item.filler,
				stems: 0,
				clusters: 0,
				orderIds: [],
				colors: [],
			};
			flower.stems += item.stems;
			flower.clusters += item.clusters;
			if (!flower.orderIds.includes(order.id)) flower.orderIds.push(order.id);
			let color = flower.colors.find((row) => row.color === item.color);
			if (!color) {
				color = { ...item, stems: 0, clusters: 0, bouquets: 0, orderIds: [] };
				flower.colors.push(color);
			}
			color.stems += item.stems;
			color.clusters += item.clusters;
			color.bouquets += item.bouquets;
			if (!color.orderIds.includes(order.id)) color.orderIds.push(order.id);
			byFlower.set(flowerKey, flower);
		}
	}
	const tally = [...byFlower.values()];
	for (const flower of tally)
		flower.colors.sort(
			(a, b) => b.stems - a.stems || a.color.localeCompare(b.color),
		);
	return tally.sort(
		(a, b) =>
			Number(a.filler) - Number(b.filler) ||
			b.stems - a.stems ||
			b.clusters - a.clusters ||
			a.flower.localeCompare(b.flower),
	);
}
