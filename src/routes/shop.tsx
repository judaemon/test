import { createFileRoute } from "@tanstack/solid-router";

import { ShopPage } from "~/components/shop/shop-page";
import { validateShopFilters } from "~/lib/shop-filters";
import {
	BUSINESS_JSON_LD,
	HOME_DESCRIPTION,
	HOME_TITLE,
	jsonLdScript,
	pageHead,
} from "~/lib/site";

// /shop shows the home page, so both point Google at "/".
export const SHOP_HEAD = {
	...pageHead({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/" }),
	scripts: [jsonLdScript(BUSINESS_JSON_LD)],
};

export const Route = createFileRoute("/shop")({
	validateSearch: validateShopFilters,
	head: () => SHOP_HEAD,
	component: ShopPage,
});
