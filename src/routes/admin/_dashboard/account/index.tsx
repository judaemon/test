import { createFileRoute, redirect } from "@tanstack/solid-router";

export const Route = createFileRoute("/admin/_dashboard/account/")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/account/profile", replace: true });
	},
});
