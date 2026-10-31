import type { RecipeItem } from "~/types/product";

export interface FlowerKind {
	name: string;
	/** Counted stem by stem; otherwise added as a cluster with no count. */
	counted: boolean;
	/**
	 * Whether the recipe also names a color: `true` for any color typed in,
	 * or the fixed choices.
	 */
	colors?: true | readonly string[];
	/** Extra words shown in the picker. */
	hint?: string;
}

export const FLOWER_KINDS: readonly FlowerKind[] = [
	// Counted
	{ name: "Sunflower", counted: true },
	{ name: "Roses", counted: true, colors: true },
	{ name: "Carnations", counted: true, colors: true },
	{ name: "Gerbera", counted: true, colors: true },
	{ name: "Tulips", counted: true },
	{ name: "Stargazer", counted: true },
	{ name: "Amaranthus", counted: true },
	{ name: "White lily", counted: true },
	{ name: "Chrysanthemum", counted: true },
	{ name: "Sunlight", counted: true, hint: "big yellow chrysanthemum" },
	// Clusters
	{ name: "Gypsophila", counted: false },
	{ name: "Aster", counted: false, colors: ["White", "Violet"] },
	{ name: "Alstroemeria", counted: false },
	{ name: "Eucalyptus", counted: false },
	{ name: "Misty", counted: false, colors: ["Violet", "White"] },
	{ name: "Radus", counted: false },
	{ name: "Hydrangeas", counted: false },
	{ name: "Malaysian mums", counted: false },
	{ name: "Lisianthus / Paper roses", counted: false },
	{ name: "Snapdragon", counted: false },
	{ name: "Statice", counted: false },
	{ name: "Chamomile", counted: false },
	{ name: "Ornamental asparagus", counted: false },
];

export function flowerKind(name: string) {
	return FLOWER_KINDS.find((kind) => kind.name === name);
}

export function isCountedFlower(name: string) {
	return flowerKind(name)?.counted ?? false;
}

/** Total counted flowers in a bouquet; clusters don't add to it. */
export function stemCount(recipe: RecipeItem[] = []) {
	return recipe.reduce((sum, item) => sum + (item.count ?? 0), 0);
}

/** "18 × Roses · Red" or "Aster · Violet (cluster)". */
export function formatRecipeItem(item: RecipeItem) {
	const name = item.color ? `${item.flower} · ${item.color}` : item.flower;
	return item.count ? `${item.count} × ${name}` : `${name} (cluster)`;
}

/** The flower a bouquet is mostly made of: the counted one with the most stems. */
export function mainFlower(recipe: RecipeItem[] = []) {
	return [...recipe]
		.filter((item) => item.count)
		.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
}
