import { createFileRoute, redirect } from "@tanstack/solid-router";

/** The order log is part of Admin → Logs now; old links land there. */
export const Route = createFileRoute("/admin/_dashboard/order-log")({
	beforeLoad: ({ search }) => {
		const source = search as Record<string, unknown>;
		const text = (value: unknown) =>
			typeof value === "string" && value ? value : undefined;
		throw redirect({
			to: "/admin/logs",
			search: {
				area: "orders",
				item: text(source.order),
				who: text(source.who),
			},
			replace: true,
		});
	},
});
