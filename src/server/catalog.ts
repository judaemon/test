import { createServerFn } from "@tanstack/solid-start";
import type { Product } from "~/types/product";
import { listArrangementTypes } from "./arrangement-types-repo";
import { findBouquetBySlug } from "./bouquet-slugs";
import {
	findBouquetRedirect,
	getAdminProduct,
	listPublicProducts,
	toPublicProduct,
} from "./catalog-repo";
import { getCustomSettings } from "./custom-repo";
import { getDb } from "./db";
import { listLiveOrderPromos } from "./order-promos-repo";
import { listLiveSales } from "./sales-repo";
import { getShopStatus } from "./shop-status-repo";
import { listSizes } from "./sizes-repo";

/** Everything the shop shows; loaded once per navigation by the root route. */
export const getCatalog = createServerFn({ method: "GET" }).handler(
	async () => {
		const custom = getCustomSettings();
		return {
			products: listPublicProducts(),
			// The builder's prices are public anyway; the bag needs them to show
			// totals. Staff's stock count and suppliers aren't.
			custom: {
				...custom,
				wrappers: custom.wrappers.map(
					({
						stockActual: _stockActual,
						supplierIds: _supplierIds,
						...wrapper
					}) => wrapper,
				),
			},
			// For the size guide and the shop's size filter.
			sizes: listSizes().map(({ usedIn: _usedIn, ...size }) => size),
			// The shop's tabs, and each arrangement's type.
			arrangementTypes: listArrangementTypes().map(
				({ usedIn: _usedIn, sizeCount: _sizeCount, ...type }) => type,
			),
			// Sales live today; checkout prices the bag with them again on the server.
			sales: listLiveSales(),
			// Order promos live today (e.g. ₱500 off every 10th order), for the
			// Promos page and banner; checkout applies them on the server.
			orderPromos: listLiveOrderPromos(),
			// Closed when orders are full: shopping pages show its notice instead.
			shop: getShopStatus(),
		};
	},
);

export type ProductLookup =
	| { product: Product }
	/** An old link (or an id): the bouquet's link now. */
	| { moved: string }
	| null;

/** The bouquet a shop link is for, or where an old link of one goes now. */
export const getProduct = createServerFn({ method: "GET" })
	.validator((link: unknown) => {
		if (typeof link !== "string") throw new Error("Invalid product link");
		return link.slice(0, 120);
	})
	.handler(async ({ data }): Promise<ProductLookup> => {
		const found = findBouquetBySlug(getDb(), data);
		const product = found && getAdminProduct(found.id);
		if (!found || !product?.isVisible) return null;
		return found.moved
			? { moved: found.slug }
			: { product: toPublicProduct(product) };
	});

/** Where an old product link (from before bouquets had their own pages) goes now. */
export const findMovedProduct = createServerFn({ method: "GET" })
	.validator((input: unknown) => {
		const source = (input ?? {}) as Record<string, unknown>;
		return {
			productId: String(source.productId ?? "").slice(0, 80),
			variant: String(source.variant ?? "").slice(0, 80),
		};
	})
	.handler(async ({ data }) =>
		findBouquetRedirect(data.productId, data.variant),
	);
