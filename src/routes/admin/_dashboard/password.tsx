import { createFileRoute, redirect } from "@tanstack/solid-router";

/** The password form lives under Account › Security; old links land there. */
export const Route = createFileRoute("/admin/_dashboard/password")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/account/security", replace: true });
	},
});
