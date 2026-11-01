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

/** Total flowers in a bouquet; old cluster items (no count) don't add to it. */
export function stemCount(recipe: RecipeItem[] = []) {
	return recipe.reduce((sum, item) => sum + (item.count ?? 0), 0);
}

/** "18 × Roses · Red"; items from before everything was counted read "Aster · Violet (cluster)". */
export function formatRecipeItem(item: RecipeItem) {
	const name = item.color ? `${item.flower} · ${item.color}` : item.flower;
	return item.count ? `${item.count} × ${name}` : `${name} (cluster)`;
}

/** The flower a bouquet is mostly made of: the one with the most stems. */
export function mainFlower(recipe: RecipeItem[] = []) {
	return [...recipe]
		.filter((item) => item.count)
		.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0];
}
