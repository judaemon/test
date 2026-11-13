import { createFileRoute, Link, Outlet } from "@tanstack/solid-router";
import { For } from "solid-js";

import { adminButton, PageHeader } from "~/components/admin/ui";
import { cn } from "~/lib/utils";
import { getReport } from "~/server/admin/reports";

/** Every report page shares this one load of the report. */
export const Route = createFileRoute("/admin/_dashboard/reports")({
	loader: () => getReport(),
	component: ReportsLayout,
});

const TABS = [
	{ to: "/admin/reports", label: "Summary", exact: true },
	{ to: "/admin/reports/money", label: "Money" },
	{ to: "/admin/reports/orders", label: "Orders" },
	{ to: "/admin/reports/battalions", label: "Battalions" },
	{ to: "/admin/reports/deliveries", label: "Deliveries" },
	{ to: "/admin/reports/cards", label: "Cards" },
	{ to: "/admin/reports/cash", label: "Cash payments" },
	{ to: "/admin/reports/flowers", label: "Flowers to buy" },
	{ to: "/admin/reports/bouquets", label: "Bouquets" },
] as const;

function ReportsLayout() {
	return (
		<div class="pb-16 print:pb-0">
			{/* Short bond paper. Only here: dedication cards set their own size. */}
			<style>{"@page { size: letter; margin: 12mm; }"}</style>
			<PageHeader
				title="Reports"
				description="Active orders only, unless a report says otherwise. Click a report's title to list all its orders, or any number to see who ordered."
				actions={
					<button
						type="button"
						onClick={() => window.print()}
						class={cn(adminButton.secondary, "print:hidden")}
					>
						Print this page
					</button>
				}
			/>
			<nav
				aria-label="Reports"
				class="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-petal-100 px-1 print:hidden"
			>
				<For each={TABS}>
					{(tab) => (
						<Link
							to={tab.to}
							activeOptions={{ exact: "exact" in tab }}
							activeProps={{
								class: "border-petal-700 font-medium text-petal-900",
							}}
							inactiveProps={{
								class:
									"border-transparent text-petal-900/65 hover:text-petal-900",
							}}
							class="-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							{tab.label}
						</Link>
					)}
				</For>
			</nav>
			<Outlet />
		</div>
	);
}
