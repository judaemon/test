import { createFileRoute } from "@tanstack/solid-router";
import { createMemo, For } from "solid-js";

import {
	CollectedBar,
	count,
	createOrderList,
	OrderList,
	PaymentCells,
	type PaymentColumns,
	ReportHeading,
	Stat,
	sumColumn,
	useMoney,
	useReport,
} from "~/components/admin/reports";
import { adminCard } from "~/components/admin/ui";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/admin/_dashboard/reports/money")({
	component: MoneyReport,
});

function MoneyReport() {
	const report = useReport();
	const money = useMoney();
	const list = createOrderList();
	const show = list.show;
	const allMethods = createMemo(
		(): PaymentColumns => ({
			onHold: sumColumn(report().payments, "onHold"),
			pending: sumColumn(report().payments, "pending"),
			paid: sumColumn(report().payments, "paid"),
			rejected: sumColumn(report().payments, "rejected"),
			total: sumColumn(report().payments, "total"),
		}),
	);
	const showPayments = () =>
		list.showSections(
			"Payments by method",
			report().payments.flatMap((row) =>
				(
					[
						["On hold", row.onHold],
						["Pending", row.pending],
						["Paid", row.paid],
						["Rejected", row.rejected],
					] as const
				).map(([status, group]) => ({
					heading: `${row.label} · ${status}`,
					group,
				})),
			),
		);

	return (
		<>
			<section class="mb-6" aria-labelledby="money-heading">
				<h2 id="money-heading" class="mb-1 font-semibold">
					Money
				</h2>
				<p class="mb-3 text-sm text-petal-900/60">
					Every order except cancelled ones; Cancelled shows those. Received
					counts verified and card payments, and down payments on orders that
					still owe the rest.
				</p>
				<CollectedBar />
				<dl class="grid grid-cols-2 gap-3 lg:grid-cols-3">
					<Stat
						label="Ordered"
						value={money(report().money.ordered.amount)}
						hint={`${count(report().money.ordered.orders, "order")} · ${money(report().money.averageOrder)} on average`}
						onOpen={() => show("Ordered", report().money.ordered)}
					/>
					<Stat
						label="Received"
						value={money(report().money.received.amount)}
						hint={`From ${count(report().money.received.orders, "order")}`}
						onOpen={() => show("Received", report().money.received)}
					/>
					<Stat
						label="Still to collect"
						value={money(report().money.toCollect.amount)}
						hint={`${count(report().money.toCollect.orders, "order")} still owing`}
						onOpen={() => show("Still to collect", report().money.toCollect)}
					/>
					<Stat
						label="Verifying"
						value={money(report().money.verifying.amount)}
						hint={`${count(report().money.verifying.orders, "reference number")} to check`}
						onOpen={() => show("Verifying payment", report().money.verifying)}
					/>
					<Stat
						label="On hold"
						value={money(report().money.onHold.amount)}
						hint={`${count(report().money.onHold.orders, "order")} not paid yet`}
						onOpen={() => show("On hold", report().money.onHold)}
					/>
					<Stat
						label="Payment problems"
						value={money(report().money.rejected.amount)}
						hint={`${count(report().money.rejected.orders, "payment")} didn’t match`}
						onOpen={() => show("Needs payment check", report().money.rejected)}
					/>
					<Stat
						label="Sale discounts"
						value={money(report().money.saleDiscounts.amount)}
						hint={`On ${count(report().money.saleDiscounts.orders, "order")}`}
						onOpen={() => show("Sale discounts", report().money.saleDiscounts)}
					/>
					<Stat
						label="Promo discounts"
						value={money(report().money.promoDiscounts.amount)}
						hint={`On ${count(report().money.promoDiscounts.orders, "order")}`}
						onOpen={() =>
							show("Promo discounts", report().money.promoDiscounts)
						}
					/>
					<Stat
						label="Cancelled"
						value={money(report().money.cancelled.amount)}
						hint={`${count(report().money.cancelled.orders, "cancelled order")}`}
						onOpen={() => show("Cancelled orders", report().money.cancelled)}
					/>
				</dl>
			</section>

			<section class="mb-6" aria-labelledby="received-by-method">
				<h2 id="received-by-method" class="mb-3 font-semibold">
					Received by method
				</h2>
				<dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<For each={report().payments}>
						{(row) => (
							<Stat
								label={`${row.label} received`}
								value={money(row.paid.amount)}
								hint={`${money(row.total.amount)} ordered in total`}
								onOpen={() => show(`${row.label} · Paid`, row.paid)}
							/>
						)}
					</For>
				</dl>
			</section>

			<section
				class={cn(adminCard, "overflow-x-auto p-5 print:overflow-visible")}
				aria-labelledby="by-payment"
			>
				<ReportHeading
					id="by-payment"
					title="Payments by method"
					onOpen={showPayments}
					class="mb-1"
				/>
				<p class="mb-4 text-sm text-petal-900/60">
					On hold: ordered, no reference number yet. Pending: waiting for staff
					to check the reference number. Paid: verified, plus down payments on
					orders that still owe the rest (those columns show what’s still owed).
					Total: all of them together.
				</p>
				<table class="w-full min-w-[720px] text-left text-sm print:min-w-0">
					<thead class="text-xs uppercase tracking-wide text-petal-900/55">
						<tr>
							<th class="pb-2 pr-4 font-medium">Method</th>
							<th class="pb-2 pr-4 text-right font-medium">On hold</th>
							<th class="pb-2 pr-4 text-right font-medium">Pending</th>
							<th class="pb-2 pr-4 text-right font-medium">Paid</th>
							<th class="pb-2 pr-4 text-right font-medium">Rejected</th>
							<th class="pb-2 text-right font-medium">Total</th>
						</tr>
					</thead>
					<tbody>
						<For each={report().payments}>
							{(row) => (
								<tr class="border-t border-petal-100">
									<th scope="row" class="py-3 pr-4 font-medium">
										{row.label}
									</th>
									<PaymentCells
										label={row.label}
										row={row}
										money={money}
										onOpen={show}
									/>
								</tr>
							)}
						</For>
					</tbody>
					<tfoot>
						<tr class="border-t-2 border-petal-200">
							<th scope="row" class="py-3 pr-4 font-semibold">
								All methods
							</th>
							<PaymentCells
								label="All methods"
								row={allMethods()}
								money={money}
								onOpen={show}
							/>
						</tr>
					</tfoot>
				</table>
			</section>

			<OrderList list={list} />
		</>
	);
}
