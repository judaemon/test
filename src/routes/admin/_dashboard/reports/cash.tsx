import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
	FilterTabs,
	isPaid,
	useMoney,
	useReport,
} from "~/components/admin/reports";
import { adminCard } from "~/components/admin/ui";
import { CompanyLabel } from "~/components/order/company-label";
import { formatSerialNumber } from "~/lib/checkout";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/admin/_dashboard/reports/cash")({
	component: CashPayments,
});

type CashFilter = "all" | "unpaid" | "paid";

/**
 * Everyone paying in cash to 1st Class RICARDE, and whether staff have marked
 * their order paid: a checklist for collecting. Cancelled orders are left out.
 */
function CashPayments() {
	const report = useReport();
	const money = useMoney();
	const [filter, setFilter] = createSignal<CashFilter>("all");
	const cash = createMemo(() =>
		report()
			.orders.filter(
				(order) =>
					order.paymentMethod === "cash" && order.status !== "cancelled",
			)
			.sort(
				(a, b) =>
					Number(isPaid(a)) - Number(isPaid(b)) || a.name.localeCompare(b.name),
			),
	);
	const unpaid = () => cash().filter((order) => !isPaid(order));
	const paid = () => cash().filter(isPaid);
	const shown = () =>
		filter() === "paid" ? paid() : filter() === "unpaid" ? unpaid() : cash();
	const collected = () =>
		cash().reduce((sum, order) => sum + order.received, 0);
	const owed = () =>
		cash().reduce((sum, order) => sum + (order.total - order.received), 0);
	const tabs: { key: CashFilter; label: string; count: () => number }[] = [
		{ key: "all", label: "All", count: () => cash().length },
		{ key: "unpaid", label: "Not paid", count: () => unpaid().length },
		{ key: "paid", label: "Paid", count: () => paid().length },
	];
	return (
		<section class={cn(adminCard, "p-5")} aria-labelledby="cash-payments">
			<div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
				<h2 id="cash-payments" class="font-semibold">
					Cash payments · 1st Class RICARDE (Foxtrot)
				</h2>
				<p class="text-sm tabular-nums text-petal-900/70">
					Collected <strong class="font-semibold">{money(collected())}</strong>
					{" · "}Still to collect{" "}
					<strong class="font-semibold text-error-foreground">
						{money(owed())}
					</strong>
				</p>
			</div>
			<p class="mb-4 text-sm text-petal-900/60">
				Everyone who chose cash, not counting cancelled orders. Paid means staff
				verified the cash on the order’s page.
			</p>
			<FilterTabs
				label="Show"
				tabs={tabs}
				value={filter()}
				onChange={setFilter}
			/>
			<Show
				when={shown().length}
				fallback={
					<p class="text-sm text-petal-900/60">
						{cash().length ? "No orders here." : "No one has chosen cash yet."}
					</p>
				}
			>
				<div class="overflow-x-auto print:overflow-visible">
					<table class="w-full min-w-[720px] text-left text-sm print:min-w-0">
						<thead class="text-xs uppercase tracking-wide text-petal-900/55">
							<tr>
								<th class="pb-2 pr-3 text-right font-medium">
									<span class="sr-only">Count</span>#
								</th>
								<th class="pb-2 pr-4 font-medium">Customer</th>
								<th class="pb-2 pr-4 font-medium">Class · Company</th>
								<th class="pb-2 pr-4 font-medium">Serial no.</th>
								<th class="pb-2 pr-4 font-medium">Order</th>
								<th class="pb-2 pr-4 text-right font-medium">Amount</th>
								<th class="pb-2 font-medium">Paid?</th>
							</tr>
						</thead>
						<tbody>
							<For each={shown()}>
								{(order, i) => (
									<tr class="border-t border-petal-100">
										<td class="py-2.5 pr-3 text-right text-xs tabular-nums text-petal-900/55 print:text-black/70">
											{i() + 1}
										</td>
										<td class="py-2.5 pr-4 font-medium">{order.name}</td>
										<td class="py-2.5 pr-4">
											<CompanyLabel
												company={order.company}
												className={order.className}
											/>
										</td>
										<td class="py-2.5 pr-4 tabular-nums">
											{order.serialNumber
												? formatSerialNumber(order.serialNumber)
												: "—"}
										</td>
										<td class="py-2.5 pr-4">
											<Link
												to="/admin/orders/$orderId"
												params={{ orderId: order.id }}
												class="font-medium underline-offset-2 hover:underline"
											>
												#{order.number}
											</Link>
											<span class="ml-1.5 text-xs text-petal-900/55">
												{new Date(order.createdAt).toLocaleDateString("en-PH", {
													timeZone: "Asia/Manila",
													month: "short",
													day: "numeric",
												})}
											</span>
										</td>
										<td class="py-2.5 pr-4 text-right tabular-nums">
											{money(order.total)}
										</td>
										<td class="py-2.5">
											<Show
												when={isPaid(order)}
												fallback={
													<span class="inline-flex items-center gap-1 rounded-full bg-error px-2.5 py-0.5 text-xs font-semibold text-error-foreground">
														<span aria-hidden="true">✗</span> Not paid
														<Show when={order.received > 0}>
															<span class="font-normal">
																{" "}
																({money(order.received)} in)
															</span>
														</Show>
													</span>
												}
											>
												<span class="inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-0.5 text-xs font-semibold text-success-foreground">
													<span aria-hidden="true">✓</span> Paid
												</span>
											</Show>
										</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
				</div>
			</Show>
		</section>
	);
}
