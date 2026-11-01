import { createFileRoute, redirect } from "@tanstack/solid-router";

// Old address of Signature bouquets; kept so bookmarks still work.
export const Route = createFileRoute("/admin/_dashboard/products/")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/signature-bouquets", statusCode: 301 });
	},
});
