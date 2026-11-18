import { createFileRoute, redirect } from "@tanstack/solid-router";

/** The password form now lives on the profile page; old links land there. */
export const Route = createFileRoute("/admin/_dashboard/password")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/profile", replace: true });
	},
});
