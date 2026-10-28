import { useLoaderData, useRouteContext } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import { createMemo } from "solid-js";

import { cartStore } from "~/lib/cart-store";
import { priceCart } from "~/lib/pricing";

/** The shop catalog, loaded by the root route on every navigation. */
export function useCatalog() {
	return useLoaderData({ from: "__root__" });
}

/** The bag priced against the live catalog (unknown items are dropped). */
export function usePricedCart() {
	const catalog = useCatalog();
	const lines = useSelector(cartStore, (state) => state.lines);
	return createMemo(() => priceCart(lines(), catalog()));
}

/** The signed-in shopper, or null for guests (from the root route). */
export function useSessionUser() {
	return useRouteContext({
		from: "__root__",
		select: (context) => context.user,
	});
}
