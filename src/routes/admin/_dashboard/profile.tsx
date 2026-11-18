import { createFileRoute, redirect } from "@tanstack/solid-router";

/** Profile moved into the Account area; old links land there. */
export const Route = createFileRoute("/admin/_dashboard/profile")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/account/profile", replace: true });
	},
});
