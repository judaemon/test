import { createServerFn } from "@tanstack/solid-start";

import type { AdminProduct } from "~/types/product";
import { requireStaff } from "../admin-auth";
import { listAdminProducts } from "../catalog-repo";
import { getDb } from "../db";
import { flowerPhotoMap } from "../florist-work";
import {
	backfillRecipeVersions,
	latestRecipeVersions,
	type RecipeVersionInfo,
} from "../recipe-versions";

export interface FloristList {
	products: AdminProduct[];
	/** Each bouquet's flowers version, by bouquet id. */
	versions: Record<string, RecipeVersionInfo>;
	/**
	 * A photo for each flower in a recipe: by "Flower|Color", and by
	 * "Flower|" for the flower's own (recipes name no color for one-color flowers).
	 */
	flowerPhotos: Record<string, string>;
}

/** Everything the florist's printed reference list needs. */
export const getFloristList = createServerFn({ method: "GET" }).handler(
	async (): Promise<FloristList> => {
		await requireStaff();
		const db = getDb();
		// Bouquets added before versions began, should any slip through, start on v1.
		backfillRecipeVersions(db);
		const flowerPhotos = flowerPhotoMap();
		return {
			products: listAdminProducts(),
			versions: latestRecipeVersions(db),
			flowerPhotos,
		};
	},
);
