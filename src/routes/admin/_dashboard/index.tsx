import { createFileRoute, redirect } from "@tanstack/solid-router";

// The to-do board is switched off for now; staff work from the orders table.
export const Route = createFileRoute("/admin/_dashboard/")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/orders", replace: true });
	},
});
