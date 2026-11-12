import type { BouquetSizeInfo } from "~/lib/sizes";

/** A kind of floral arrangement from Admin → Arrangement types, e.g. Corsage. */
export interface ArrangementTypeInfo {
	id: string;
	/** e.g. "Corsage". */
	name: string;
	/** e.g. "Corsages", for the shop's tabs. */
	pluralName: string;
	/** e.g. "A wearable floral piece worn on the wrist." */
	description: string;
}

/** Arrangement types that are never wrapped: worn pieces. */
export const WRAPPERLESS_TYPES: readonly string[] = ["corsage", "boutonniere"];

/** Whether an arrangement of this type has a wrapper to make. */
export const usesWrapper = (type: string | undefined) =>
	!WRAPPERLESS_TYPES.includes(type ?? "");

/** Given to arrangements and sizes when nothing says otherwise. */
export const DEFAULT_ARRANGEMENT = "bouquet";

export function findArrangementType(
	types: readonly ArrangementTypeInfo[],
	id: string | undefined,
) {
	return id ? types.find((type) => type.id === id) : undefined;
}

/** The sizes an arrangement of this type can have (Admin → Sizes). */
export const sizesForType = <T extends Pick<BouquetSizeInfo, "arrangement">>(
	sizes: readonly T[],
	type: string,
) => sizes.filter((size) => size.arrangement === type);
