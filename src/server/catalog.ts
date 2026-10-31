import { createServerFn } from "@tanstack/solid-start";

import {
	getAdminProduct,
	listPublicProducts,
	toPublicProduct,
} from "./catalog-repo";
import { getCustomSettings } from "./custom-repo";

/** Everything the shop shows; loaded once per navigation by the root route. */
export const getCatalog = createServerFn({ method: "GET" }).handler(
	async () => ({
		products: listPublicProducts(),
		// The builder's prices are public anyway; the bag needs them to show totals.
		custom: getCustomSettings(),
	}),
);

export const getProduct = createServerFn({ method: "GET" })
	.validator((productId: unknown) => {
		if (typeof productId !== "string") throw new Error("Invalid product id");
		return productId;
	})
	.handler(async ({ data }) => {
		const product = getAdminProduct(data);
		return product?.isVisible ? toPublicProduct(product) : null;
	});
