import { createFileRoute } from "@tanstack/solid-router";

import { ShopPage } from "~/components/shop/shop-page";
import { SHOP_HEAD } from "./shop";

// The home page is the shop during the Battalion Hop soft launch.
export const Route = createFileRoute("/")({
	head: () => SHOP_HEAD,
	component: ShopPage,
});
