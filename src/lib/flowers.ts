import type { RecipeItem } from "~/types/product";

export interface FlowerKind {
	name: string;
	/**
	 * Whether the recipe also names a color: `true` for any color typed in,
	 * or the fixed choices.
	 */
	colors?: true | readonly string[];
	/** Extra words shown in the picker. */
	hint?: string;
}

export const FLOWER_KINDS: readonly FlowerKind[] = [
	{ name: "Sunflower" },
	{ name: "Roses", colors: true },
	{ name: "Carnations", colors: true },
	{ name: "Gerbera", colors: true },
	{ name: "Tulips" },
	{ name: "Stargazer" },
	{ name: "Amaranthus" },
	{ name: "White lily" },
	{ name: "Chrysanthemum" },
	{ name: "Sunlight", hint: "big yellow chrysanthemum" },
	{ name: "Gypsophila" },
	{ name: "Aster", colors: ["White", "Violet"] },
	{ name: "Alstroemeria" },
	{ name: "Eucalyptus" },
	{ name: "Misty", colors: ["Violet", "White"] },
	{ name: "Radus" },
	{ name: "Hydrangeas" },
	{ name: "Malaysian mums" },
	{ name: "Lisianthus / Paper roses" },
	{ name: "Snapdragon" },
	{ name: "Statice" },
	{ name: "Chamomile" },
	{ name: "Ornamental asparagus" },
];

export function flowerKind(name: string) {
	return FLOWER_KINDS.find((kind) => kind.name === name);
}

/**
 * Total flowers in a bouquet. Filler and old cluster items (no count) don't
 * add to it.
 */
export function stemCount(recipe: RecipeItem[] = []) {
	return recipe.reduce(
		(sum, item) => sum + (item.filler ? 0 : (item.count ?? 0)),
		0,
	);
}

/** "18 × Roses · Red"; items from before everything was counted read "Aster · Violet (cluster)". */
const byName = (a = "", b = "") =>
	a.localeCompare(b, "en", { sensitivity: "base", numeric: true });

/**
 * How every printed flower list is ordered: one A to Z list by flower, then
 * color. Fillers sit in it with the rest; the same flower and color as a
 * filler comes right after the main one.
 */
export function compareFlowers(
	a: { flower: string; color?: string; filler?: boolean },
	b: { flower: string; color?: string; filler?: boolean },
) {
	return (
		byName(a.flower, b.flower) ||
		byName(a.color, b.color) ||
		Number(!!a.filler) - Number(!!b.filler)
	);
}

/** A recipe's flowers in print order, leaving the recipe itself as it is. */
export const sortedRecipe = (recipe: readonly RecipeItem[]) =>
	[...recipe].sort(compareFlowers);

export function formatRecipeItem(item: RecipeItem) {
	const name = item.color ? `${item.flower} · ${item.color}` : item.flower;
	if (!item.count) return `${name} (cluster)`;
	return `${item.count} × ${name}${item.filler ? " (filler)" : ""}`;
}

/** Same flowers, colors and counts, in any order. */
export function sameRecipe(a: RecipeItem[], b: RecipeItem[]) {
	const key = (recipe: RecipeItem[]) =>
		recipe
			.map((item) =>
				[
					item.flower,
					item.color ?? "",
					item.count ?? 1,
					item.filler ? 1 : 0,
				].join("|"),
			)
			.sort()
			.join(";");
	return key(a) === key(b);
}

/** The flower a bouquet is mostly made of: the one with the most stems. */
export function mainFlower(recipe: RecipeItem[] = []) {
	return [...recipe]
		.filter((item) => item.count && !item.filler)
		.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
}
