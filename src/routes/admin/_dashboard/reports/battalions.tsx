import { createFileRoute } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
	bouquetCount,
	byName,
	count,
	createOrderList,
	drill,
	FilterTabs,
	groupOf,
	isPaid,
	type ListSection,
	OrderList,
	OrderTable,
	useMoney,
	useReport,
} from "~/components/admin/reports";
import { adminButton, adminCard } from "~/components/admin/ui";
import { ColorSwatch } from "~/components/order/company-label";
import { BATTALIONS, battalionOf, companyColor } from "~/lib/cadets";
import { cn } from "~/lib/utils";
import type { ReportOrder } from "~/server/admin/reports";

export const Route = createFileRoute("/admin/_dashboard/reports/battalions")({
	component: BattalionsReport,
});

type BattalionFilter = "all" | (typeof BATTALIONS)[number]["name"];
type PaidFilter = "all" | "paid" | "unpaid";

interface CompanyBlock {
	name: string;
	color?: string;
	orders: ReportOrder[];
}

interface BattalionBlock {
	name: string;
	companies: CompanyBlock[];
	orders: ReportOrder[];
}

/**
 * Active orders by battalion, then company: 1/2 Battalion is Alfa to Delta,
 * 3/4 Battalion is Echo to Hawk. Civilians aren't in a battalion.
 */
function BattalionsReport() {
	const report = useReport();
	const money = useMoney();
	const list = createOrderList();
	const [battalion, setBattalion] = createSignal<BattalionFilter>("all");
	const [paid, setPaid] = createSignal<PaidFilter>("all");

	const active = createMemo(() =>
		report().orders.filter((order) => order.status !== "cancelled"),
	);
	const matchesPaid = (order: ReportOrder) =>
		paid() === "all" || (paid() === "paid") === isPaid(order);
	const counted = createMemo(() => active().filter(matchesPaid));

	const battalions = createMemo((): BattalionBlock[] =>
		BATTALIONS.map((b) => {
			const companies = b.companies.map((name) => ({
				name,
				color: companyColor(name),
				orders: counted()
					.filter((order) => order.company === name)
					.sort(byName),
			}));
			return {
				name: b.name,
				companies,
				orders: companies.flatMap((company) => company.orders),
			};
		}),
	);
	const shown = () =>
		battalion() === "all"
			? battalions()
			: battalions().filter((b) => b.name === battalion());
	const outside = createMemo(() =>
		counted().filter((order) => !battalionOf(order.company)),
	);

	const total = (orders: ReportOrder[]) =>
		orders.reduce((sum, order) => sum + order.total, 0);
	const collected = (orders: ReportOrder[]) =>
		orders.reduce(
			(sum, order) => sum + Math.min(order.received, order.total),
			0,
		);
	const paidLabel = () =>
		paid() === "paid" ? " · paid" : paid() === "unpaid" ? " · not paid" : "";

	const companySections = (b: BattalionBlock, prefix = false): ListSection[] =>
		b.companies.map((company) => ({
			heading: prefix ? `${b.name} · ${company.name}` : company.name,
			color: company.color,
			group: groupOf(company.orders),
		}));
	const viewBattalion = (b: BattalionBlock) =>
		list.showSections(`${b.name}${paidLabel()}`, companySections(b));
	const viewCompany = (b: BattalionBlock, company: CompanyBlock) =>
		list.showSections(`${b.name} · ${company.name}${paidLabel()}`, [
			{
				heading: company.name,
				color: company.color,
				group: groupOf(company.orders),
			},
		]);
	const viewShown = () =>
		list.showSections(
			`${battalion() === "all" ? "Orders by battalion" : battalion()}${paidLabel()}`,
			shown().flatMap((b) => companySections(b, battalion() === "all")),
		);

	const battalionTabs: {
		key: BattalionFilter;
		label: string;
		count: () => number;
	}[] = [
		{
			key: "all",
			label: "Both battalions",
			count: () => battalions().reduce((n, b) => n + b.orders.length, 0),
		},
		...BATTALIONS.map((b) => ({
			key: b.name,
			label: b.name,
			count: () =>
				battalions().find((block) => block.name === b.name)?.orders.length ?? 0,
		})),
	];
	const paidTabs: { key: PaidFilter; label: string }[] = [
		{ key: "all", label: "All orders" },
		{ key: "paid", label: "Paid" },
		{ key: "unpaid", label: "Not paid yet" },
	];

	return (
		<>
			<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 class="font-semibold">Orders by battalion</h2>
					<p class="mt-0.5 text-sm text-petal-900/60">
						1/2 Battalion: Alfa, Bravo, Charlie, Delta. 3/4 Battalion: Echo,
						Foxtrot, Golf, Hawk. Cancelled orders aren’t listed; paid means the
						whole amount is in.
					</p>
				</div>
				<button
					type="button"
					onClick={viewShown}
					disabled={!shown().some((b) => b.orders.length)}
					class={cn(adminButton.primary, "print:hidden")}
				>
					Export or print list
				</button>
			</div>

			<div class="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
				<FilterTabs
					label="Battalion"
					tabs={battalionTabs}
					value={battalion()}
					onChange={setBattalion}
					class="mb-0"
				/>
				<FilterTabs
					label="Payment"
					tabs={paidTabs}
					value={paid()}
					onChange={setPaid}
					class="mb-0"
				/>
			</div>

			{/* At a glance: each battalion's companies, with totals. */}
			<div
				class={cn(
					"mb-8 grid gap-5 print:hidden",
					shown().length > 1 && "lg:grid-cols-2",
				)}
			>
				<For each={shown()}>
					{(b) => (
						<section class={cn(adminCard, "p-5")}>
							<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
								<h3 class="font-semibold">
									<button
										type="button"
										onClick={() => viewBattalion(b)}
										disabled={!b.orders.length}
										class={cn(
											drill,
											"px-1 underline-offset-2 hover:underline disabled:pointer-events-none",
										)}
									>
										{b.name}
									</button>
								</h3>
								<p class="text-sm tabular-nums text-petal-900/70">
									{count(b.orders.length, "order")} ·{" "}
									{count(bouquetCount(b.orders), "bouquet")} ·{" "}
									<strong class="font-semibold">
										{money(total(b.orders))}
									</strong>
								</p>
							</div>
							<table class="w-full text-left text-sm">
								<thead class="text-xs uppercase tracking-wide text-petal-900/55">
									<tr>
										<th class="pb-2 pr-3 font-medium">Company</th>
										<th class="pb-2 pr-3 text-right font-medium">Orders</th>
										<th class="pb-2 pr-3 text-right font-medium">Bouquets</th>
										<th class="pb-2 pr-3 text-right font-medium">Paid</th>
										<th class="pb-2 text-right font-medium">Total</th>
									</tr>
								</thead>
								<tbody>
									<For each={b.companies}>
										{(company) => (
											<tr
												class={cn(
													"border-t border-petal-100 transition-colors",
													company.orders.length &&
														"cursor-pointer hover:bg-petal-50",
												)}
												onClick={() =>
													company.orders.length && viewCompany(b, company)
												}
											>
												<th scope="row" class="py-2 pr-3 font-medium">
													<span class="flex items-center gap-2">
														<ColorSwatch color={company.color} class="size-3" />
														{company.name}
													</span>
												</th>
												<td class="py-2 pr-3 text-right font-semibold tabular-nums">
													{company.orders.length}
												</td>
												<td class="py-2 pr-3 text-right tabular-nums">
													{bouquetCount(company.orders)}
												</td>
												<td class="py-2 pr-3 text-right tabular-nums text-petal-900/70">
													{company.orders.filter(isPaid).length}/
													{company.orders.length}
												</td>
												<td class="py-2 text-right tabular-nums">
													{money(total(company.orders))}
												</td>
											</tr>
										)}
									</For>
								</tbody>
								<tfoot>
									<tr class="border-t-2 border-petal-200 font-semibold">
										<th scope="row" class="py-2 pr-3">
											Total
										</th>
										<td class="py-2 pr-3 text-right tabular-nums">
											{b.orders.length}
										</td>
										<td class="py-2 pr-3 text-right tabular-nums">
											{bouquetCount(b.orders)}
										</td>
										<td class="py-2 pr-3 text-right tabular-nums">
											{b.orders.filter(isPaid).length}/{b.orders.length}
										</td>
										<td class="py-2 text-right tabular-nums">
											{money(total(b.orders))}
										</td>
									</tr>
								</tfoot>
							</table>
							<p class="mt-2 text-xs tabular-nums text-petal-900/60">
								Collected {money(collected(b.orders))} of{" "}
								{money(total(b.orders))}
							</p>
						</section>
					)}
				</For>
			</div>

			{/* The lists themselves, battalion by battalion, company by company. */}
			<For each={shown()}>
				{(b, i) => (
					<section
						class={cn("mb-8", i() > 0 && "print:break-before-page")}
						aria-label={b.name}
					>
						<h2 class="mb-3 flex flex-wrap items-baseline gap-x-3 border-b-2 border-petal-200 pb-2 font-display type-soft text-2xl font-semibold">
							{b.name}
							<span class="font-sans text-sm font-normal text-petal-900/60">
								{count(b.orders.length, "order")}
								{paidLabel()} · {money(total(b.orders))}
							</span>
						</h2>
						<For each={b.companies}>
							{(company) => (
								<div
									class={cn(
										adminCard,
										"mb-4 overflow-hidden print:break-inside-auto print:rounded-none print:border-0",
									)}
								>
									<h3 class="flex items-center gap-2 bg-petal-50 px-5 py-2.5 text-sm font-semibold print:px-2">
										<ColorSwatch color={company.color} class="size-3" />
										{company.name}
										<span class="font-normal text-petal-900/60">
											· {count(company.orders.length, "order")} ·{" "}
											{count(bouquetCount(company.orders), "bouquet")} ·{" "}
											{money(total(company.orders))}
										</span>
									</h3>
									<Show
										when={company.orders.length}
										fallback={
											<p class="px-5 py-3 text-sm text-petal-900/60">
												No orders here.
											</p>
										}
									>
										<OrderTable
											orders={company.orders}
											currency={report().currency}
										/>
									</Show>
								</div>
							)}
						</For>
					</section>
				)}
			</For>

			<Show when={battalion() === "all" && outside().length}>
				<p class="text-sm text-petal-900/60 print:hidden">
					{count(outside().length, "order")} from civilians or without a company
					aren’t in a battalion.{" "}
					<button
						type="button"
						onClick={() => list.show("Not in a battalion", groupOf(outside()))}
						class="font-medium text-petal-700 underline underline-offset-2"
					>
						See them
					</button>
				</p>
			</Show>

			<OrderList list={list} />
		</>
	);
}
