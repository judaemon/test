import { useLoaderData, useRouteContext } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import { createMemo } from "solid-js";

import { cartStore } from "~/lib/cart-store";
import { flowerPhoto } from "~/lib/custom-bouquet";
import { PAYMENT_METHODS, type PaymentMethod } from "~/lib/payment";
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

/**
 * What the bag saves when paid a particular way, if a sale for some payment
 * methods only covers it: the shop shows those sale prices, but the bag can't
 * take them off until checkout knows how it's paid.
 */
export function useBagMethodDeal() {
	const catalog = useCatalog();
	const custom = useCustomSettings();
	const sales = useSales();
	const lines = useSelector(cartStore, (state) => state.lines);
	return createMemo(() => {
		if (!sales().some((sale) => sale.paymentMethods.length)) return undefined;
		const base = priceCart(lines(), catalog(), custom(), sales()).total;
		let best: { methods: PaymentMethod[]; saves: number } | undefined;
		for (const method of PAYMENT_METHODS) {
			const total = priceCart(
				lines(),
				catalog(),
				custom(),
				sales(),
				method,
			).total;
			const saves = Math.round((base - total) * 100) / 100;
			if (saves <= 0) continue;
			if (!best || saves > best.saves) best = { methods: [method], saves };
			else if (saves === best.saves) best.methods.push(method);
		}
		return best;
	});
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
