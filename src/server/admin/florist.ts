import { createServerFn } from "@tanstack/solid-start";

import type { AdminProduct } from "~/types/product";
import { requireStaff } from "../admin-auth";
import { listAdminProducts } from "../catalog-repo";
import { getDb } from "../db";
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
		const rows = db
			.query(
				`SELECT f.name AS flower, f.image AS flowerImage, c.name AS color, c.image AS colorImage
				 FROM flowers f LEFT JOIN flower_colors c ON c.flower_id = f.id`,
			)
			.all() as {
			flower: string;
			flowerImage: string;
			color: string | null;
			colorImage: string | null;
		}[];
		const flowerPhotos: Record<string, string> = {};
		for (const row of rows) {
			if (row.flowerImage) flowerPhotos[`${row.flower}|`] = row.flowerImage;
			const photo = row.colorImage || row.flowerImage;
			if (row.color && photo)
				flowerPhotos[`${row.flower}|${row.color}`] = photo;
		}
		return {
			products: listAdminProducts(),
			versions: latestRecipeVersions(db),
			flowerPhotos,
		};
	},
);
