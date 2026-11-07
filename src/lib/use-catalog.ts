import { useLoaderData, useRouteContext } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import { createMemo } from "solid-js";

import { cartStore } from "~/lib/cart-store";
import { flowerPhoto } from "~/lib/custom-bouquet";
import { priceCart } from "~/lib/pricing";

/** The shop catalog, loaded by the root route on every navigation. */
export function useCatalog() {
	return useLoaderData({ from: "__root__", select: (data) => data.products });
}

/** Every bouquet size, smallest first, from Admin → Sizes (from the root route). */
export function useSizes() {
	return useLoaderData({ from: "__root__", select: (data) => data.sizes });
}

/** Kinds of floral arrangement, in the shop's tab order (from the root route). */
export function useArrangementTypes() {
	return useLoaderData({
		from: "__root__",
		select: (data) => data.arrangementTypes,
	});
}

/** The bouquet builder's prices, colors and wrappers (from the root route). */
export function useCustomSettings() {
	return useLoaderData({ from: "__root__", select: (data) => data.custom });
}

/** The sales live today (from the root route). */
export function useSales() {
	return useLoaderData({ from: "__root__", select: (data) => data.sales });
}

/** Order promos live today, e.g. ₱500 off every 10th order (from the root route). */
export function useOrderPromos() {
	return useLoaderData({
		from: "__root__",
		select: (data) => data.orderPromos,
	});
}

/** The bag priced against the live catalog and sales (unknown items are dropped). */
export function usePricedCart() {
	const catalog = useCatalog();
	const custom = useCustomSettings();
	const sales = useSales();
	const lines = useSelector(cartStore, (state) => state.lines);
	return createMemo(() => priceCart(lines(), catalog(), custom(), sales()));
}

/** The signed-in shopper, or null for guests (from the root route). */
export function useSessionUser() {
	return useRouteContext({
		from: "__root__",
		select: (context) => context.user,
	});
}

/**
 * A flower's photo (set in Admin → Flowers), in the given color when
 * there is a photo of that color.
 */
export function useFlowerPhotos() {
	const custom = useCustomSettings();
	return (flower: string, color?: string) =>
		flowerPhoto(
			custom().flowers.find((f) => f.name === flower),
			color,
		);
}
