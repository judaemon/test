import { createFileRoute } from "@tanstack/solid-router";
import { For } from "solid-js";

import {
	Bars,
	createOrderList,
	OrderList,
	ReportHeading,
	Stat,
	useMoney,
	useReport,
} from "~/components/admin/reports";
import { adminCard } from "~/components/admin/ui";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/admin/_dashboard/reports/orders")({
	component: OrdersReport,
});

function OrdersReport() {
	const report = useReport();
	const money = useMoney();
	const list = createOrderList();
	const show = list.show;

	return (
		<>
			<dl class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat
					label="Active orders"
					value={String(report().active.orders)}
					onOpen={() => show("Active orders", report().active)}
				/>
				<Stat
					label="Bouquets ordered"
					value={String(report().bouquets)}
					onOpen={() => show("Active orders", report().active)}
				/>
				<Stat
					label="Sales (active orders)"
					value={money(report().sales)}
					onOpen={() => show("Active orders", report().active)}
				/>
				<Stat
					label="Cancelled orders"
					value={String(report().cancelled.orders)}
					onOpen={() => show("Cancelled orders", report().cancelled)}
				/>
			</dl>

			<section class="mb-6" aria-labelledby="status-heading">
				<h2 id="status-heading" class="mb-3 font-semibold">
					Orders by status
				</h2>
				<dl class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
					<For each={report().byStatus}>
						{(row) => (
							<Stat
								label={row.label}
								value={String(row.orders)}
								hint={money(row.amount)}
								onOpen={() => show(row.label, row)}
							/>
						)}
					</For>
				</dl>
			</section>

			<div class="grid gap-5 lg:grid-cols-2">
				<section class={cn(adminCard, "p-5")} aria-labelledby="by-class">
					<ReportHeading
						id="by-class"
						title="Orders per class"
						onOpen={() => list.showRows("Orders per class", report().byClass)}
					/>
					<Bars
						rows={report().byClass}
						onOpen={(row) => show(`Class: ${row.label}`, row)}
					/>
				</section>
				<section class={cn(adminCard, "p-5")} aria-labelledby="by-company">
					<ReportHeading
						id="by-company"
						title="Orders per company"
						onOpen={() =>
							list.showRows("Orders per company", report().byCompany)
						}
					/>
					<Bars
						rows={report().byCompany}
						onOpen={(row) => show(`Company: ${row.label}`, row)}
					/>
				</section>
			</div>

			<OrderList list={list} />
		</>
	);
}
