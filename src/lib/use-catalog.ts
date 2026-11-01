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

/** The bouquet builder's prices, colors and wrappers (from the root route). */
export function useCustomSettings() {
	return useLoaderData({ from: "__root__", select: (data) => data.custom });
}

/** The bag priced against the live catalog (unknown items are dropped). */
export function usePricedCart() {
	const catalog = useCatalog();
	const custom = useCustomSettings();
	const lines = useSelector(cartStore, (state) => state.lines);
	return createMemo(() => priceCart(lines(), catalog(), custom()));
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
