/** Bouquet sizes, smallest first, as shown in the size guide picture. */
export const BOUQUET_SIZES = [
	{
		id: "petite",
		name: "Petite",
		description: "Small enough to hold in one hand",
	},
	{ id: "classic", name: "Classic", description: "Fits in one arm" },
	{ id: "impressive", name: "Impressive", description: "A bigger armful" },
	{ id: "grand", name: "Grand", description: "Covers the upper body" },
] as const;

export type BouquetSize = (typeof BOUQUET_SIZES)[number]["id"];

export const SIZE_GUIDE_IMAGE = "/images/size-guide.jpg";

export function isBouquetSize(value: unknown): value is BouquetSize {
	return BOUQUET_SIZES.some((size) => size.id === value);
}

export function bouquetSize(id: string | undefined) {
	return BOUQUET_SIZES.find((size) => size.id === id);
}
