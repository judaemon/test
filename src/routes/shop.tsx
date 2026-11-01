import { createFileRoute } from "@tanstack/solid-router";

import { ShopPage } from "~/components/shop/shop-page";

export const SHOP_HEAD = {
	meta: [
		{ title: "Battalion Hop 2027 bouquets · ORAIA" },
		{
			name: "description",
			content:
				"ORAIA's soft launch for Battalion Hop 2027: signature bouquets and custom orders.",
		},
	],
};

export const Route = createFileRoute("/shop")({
	head: () => SHOP_HEAD,
	component: ShopPage,
});
