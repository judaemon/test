import { createFileRoute, redirect } from "@tanstack/solid-router";

// Old address of a bouquet's editor; kept so bookmarks still work.
export const Route = createFileRoute("/admin/_dashboard/products/$productId")({
	beforeLoad: ({ params, search }) => {
		throw redirect({
			to: "/admin/signature-bouquets/$productId",
			params: { productId: params.productId },
			search,
			statusCode: 301,
		});
	},
});
