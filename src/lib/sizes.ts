/** A bouquet size from Admin → Sizes, e.g. Petite. */
export interface BouquetSizeInfo {
	id: string;
	name: string;
	/** e.g. "Small enough to hold in one hand". */
	description: string;
	/** Someone holding a bouquet this size, for the size guide; empty if none. */
	image: string;
}

/** A size's id, as stored on a bouquet. */
export type BouquetSize = string;

export function findSize(
	sizes: readonly BouquetSizeInfo[],
	id: string | undefined,
) {
	return id ? sizes.find((size) => size.id === id) : undefined;
}
