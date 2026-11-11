import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";

import { FilterTabs, isPaid, useReport } from "~/components/admin/reports";
import { adminCard } from "~/components/admin/ui";
import { CLASS_OPTIONS, COMPANIES } from "~/lib/cadets";
import { formatDeliveryDate, formatSerialNumber } from "~/lib/checkout";
import { shortDeliveryDate, upcomingDeliveryDates } from "~/lib/delivery-dates";
import { printFileName, usePrintTitle } from "~/lib/print-title";
import { cn } from "~/lib/utils";
import type { ReportOrder } from "~/server/admin/reports";

export const Route = createFileRoute("/admin/_dashboard/reports/deliveries")({
	component: Deliveries,
});

/** Stands in for orders with no delivery day, no class or no company. */
const NONE = "none";
const ALL = "all";

const classRank = (name: string) => {
	const index = (CLASS_OPTIONS as readonly string[]).indexOf(name);
	return index === -1 ? CLASS_OPTIONS.length : index;
};
const companyRank = (name: string) => {
	const index = COMPANIES.findIndex((company) => company.name === name);
	return index === -1 ? COMPANIES.length : index;
};

/**
 * Who gets a bouquet on each delivery day, by company and class: a list to
 * print and tick off on the day. Cancelled orders are left out.
 */
function Deliveries() {
	const report = useReport();
	const active = createMemo(() =>
		report().orders.filter((order) => order.status !== "cancelled"),
	);

	// The event's days, then any other day an order has, then "no date yet".
	const days = createMemo(() => {
		const dates = new Set(report().deliveryDates);
		for (const order of active())
			if (order.deliveryDate) dates.add(order.deliveryDate);
		const list: string[] = [...dates].sort();
		if (active().some((order) => !order.deliveryDate)) list.push(NONE);
		return list;
	});
	const firstDay = () =>
		upcomingDeliveryDates(report().deliveryDates)[0] ?? days()[0] ?? NONE;
	const [day, setDay] = createSignal<string>();
	const [klass, setKlass] = createSignal<string>(ALL);
	const [company, setCompany] = createSignal<string>(ALL);
	const [pagePerCompany, setPagePerCompany] = createSignal(false);
	const shownDay = () => day() ?? firstDay();

	const onDay = (date: string, order: ReportOrder) =>
		(order.deliveryDate || NONE) === date;
	const ofDay = createMemo(() =>
		active().filter((order) => onDay(shownDay(), order)),
	);
	const classOf = (order: ReportOrder) => order.className || NONE;
	const companyOf = (order: ReportOrder) => order.company || NONE;

	const classes = createMemo(() =>
		[...new Set(ofDay().map(classOf))].sort(
			(a, b) => classRank(a) - classRank(b) || a.localeCompare(b),
		),
	);
	const companies = createMemo(() =>
		[...new Set(ofDay().map(companyOf))].sort(
			(a, b) => companyRank(a) - companyRank(b) || a.localeCompare(b),
		),
	);

	const shown = createMemo(() =>
		ofDay()
			.filter(
				(order) =>
					(klass() === ALL || classOf(order) === klass()) &&
					(company() === ALL || companyOf(order) === company()),
			)
			.sort(
				(a, b) =>
					classRank(a.className) - classRank(b.className) ||
					a.name.localeCompare(b.name),
			),
	);
	const groups = createMemo(() => {
		const byCompany = new Map<string, ReportOrder[]>();
		for (const order of shown()) {
			const key = companyOf(order);
			byCompany.set(key, [...(byCompany.get(key) ?? []), order]);
		}
		return [...byCompany.entries()].sort(
			([a], [b]) => companyRank(a) - companyRank(b) || a.localeCompare(b),
		);
	});

	const bouquetCount = (orders: ReportOrder[]) =>
		orders.reduce(
			(sum, order) =>
				sum + order.lines.reduce((n, line) => n + line.quantity, 0),
			0,
		);
	const dayLabel = (date: string) =>
		date === NONE ? "No date yet" : shortDeliveryDate(date);
	const classLabel = (name: string) => (name === NONE ? "No class" : name);
	const companyLabel = (name: string) => (name === NONE ? "No company" : name);

	// The saved PDF's name: "Deliveries - Sat, Nov 14 - 2CL - Delta - Nov 11".
	usePrintTitle(() =>
		printFileName([
			"Deliveries",
			dayLabel(shownDay()),
			klass() !== ALL && classLabel(klass()),
			company() !== ALL && companyLabel(company()),
		]),
	);

	const pickDay = (date: string) => {
		setDay(date);
		setKlass(ALL);
		setCompany(ALL);
	};

	return (
		<section class={cn(adminCard, "p-5 print:border-0 print:p-0")}>
			<div class="print:hidden">
				<h2 class="mb-1 font-semibold">Deliveries</h2>
				<p class="mb-4 text-sm text-petal-900/60">
					Who gets a bouquet on each day, by company and class. Pick a day and
					narrow it down, then print. Give orders their day in Orders, in the
					Delivery date column.
				</p>
				<FilterTabs
					label="Delivery day"
					tabs={days().map((date) => ({
						key: date,
						label: dayLabel(date),
						count: () => active().filter((order) => onDay(date, order)).length,
					}))}
					value={shownDay()}
					onChange={pickDay}
					class="mb-3"
				/>
				<Show when={ofDay().length}>
					<div class="mb-3 flex flex-wrap items-center gap-x-2">
						<span class="mr-1 text-sm font-medium">Class</span>
						<FilterTabs
							label="Class"
							tabs={[ALL, ...classes()].map((key) => ({
								key,
								label: key === ALL ? "All" : classLabel(key),
								count: () =>
									key === ALL
										? ofDay().length
										: ofDay().filter((order) => classOf(order) === key).length,
							}))}
							value={klass()}
							onChange={setKlass}
							class="mb-0"
						/>
					</div>
					<div class="mb-3 flex flex-wrap items-center gap-x-2">
						<span class="mr-1 text-sm font-medium">Company</span>
						<FilterTabs
							label="Company"
							tabs={[ALL, ...companies()].map((key) => ({
								key,
								label: key === ALL ? "All" : companyLabel(key),
								count: () =>
									ofDay().filter(
										(order) =>
											(key === ALL || companyOf(order) === key) &&
											(klass() === ALL || classOf(order) === klass()),
									).length,
							}))}
							value={company()}
							onChange={setCompany}
							class="mb-0"
						/>
					</div>
					<label class="mb-4 flex min-h-10 w-fit cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={pagePerCompany()}
							onChange={(e) => setPagePerCompany(e.currentTarget.checked)}
							class="size-5 accent-petal-700"
						/>
						Print each company on its own page
					</label>
				</Show>
			</div>

			<Show
				when={shown().length}
				fallback={
					<p class="text-sm text-petal-900/60">
						{ofDay().length
							? "No orders match these filters."
							: "No orders for this day yet."}
					</p>
				}
			>
				<For each={groups()}>
					{([name, orders], index) => (
						<div
							class={cn(
								"mb-6 print:mb-4",
								pagePerCompany() &&
									index() < groups().length - 1 &&
									"print:break-after-page",
							)}
						>
							{/* Repeated per company, so a page handed out on its own says what it is. */}
							<header class="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b-2 border-petal-900 pb-1.5 print:border-black">
								<div>
									<p class="text-xs uppercase tracking-widest text-petal-900/60 print:text-[8pt] print:text-black/70">
										Deliveries ·{" "}
										{shownDay() === NONE
											? "No date yet"
											: formatDeliveryDate(shownDay())}
										<Show when={klass() !== ALL}> · {classLabel(klass())}</Show>
									</p>
									<h3 class="font-display text-xl font-semibold leading-tight print:text-[16pt]">
										{companyLabel(name)}
									</h3>
								</div>
								<p class="text-sm tabular-nums text-petal-900/70 print:text-[9pt] print:text-black">
									{orders.length} {orders.length === 1 ? "order" : "orders"} ·{" "}
									{bouquetCount(orders)}{" "}
									{bouquetCount(orders) === 1 ? "bouquet" : "bouquets"}
								</p>
							</header>
							<div class="overflow-x-auto print:overflow-visible">
								<table class="w-full min-w-[640px] text-left text-sm print:min-w-0 print:text-[9pt]">
									<thead class="text-xs uppercase tracking-wide text-petal-900/55 print:text-[7.5pt] print:text-black/70">
										<tr>
											<th class="w-8 pb-1.5 pr-2 font-medium">
												<span class="sr-only">Delivered</span>✓
											</th>
											<th class="pb-1.5 pr-3 font-medium">Order</th>
											<th class="pb-1.5 pr-3 font-medium">Name</th>
											<th class="pb-1.5 pr-3 font-medium">Class</th>
											<th class="pb-1.5 pr-3 font-medium">Serial no.</th>
											<th class="pb-1.5 pr-3 font-medium">Bouquets</th>
											<th class="pb-1.5 font-medium">Payment</th>
										</tr>
									</thead>
									<tbody>
										<For each={orders}>
											{(order) => (
												<tr class="border-t border-petal-100 align-top print:break-inside-avoid print:border-black/25">
													<td class="py-2 pr-2 print:py-1">
														<span class="inline-block size-4 rounded-sm border-2 border-petal-900/40 print:border-black" />
													</td>
													<td class="py-2 pr-3 font-semibold tabular-nums print:py-1">
														<Link
															to="/admin/orders/$orderId"
															params={{ orderId: order.id }}
															class="underline-offset-2 hover:underline print:no-underline"
														>
															#{order.number}
														</Link>
													</td>
													<td class="py-2 pr-3 font-medium print:py-1">
														{order.name}
													</td>
													<td class="py-2 pr-3 print:py-1">
														{order.className || "—"}
													</td>
													<td class="py-2 pr-3 tabular-nums print:py-1">
														{order.serialNumber
															? formatSerialNumber(order.serialNumber)
															: "—"}
													</td>
													<td class="py-2 pr-3 print:py-1">
														<For each={order.lines}>
															{(line) => (
																<span class="block leading-snug">
																	<Show when={line.quantity > 1}>
																		<strong class="font-semibold tabular-nums">
																			{line.quantity} ×{" "}
																		</strong>
																	</Show>
																	{line.title}
																	<span class="text-petal-900/60 print:text-black/60">
																		{" "}
																		· {line.colorName}
																	</span>
																</span>
															)}
														</For>
													</td>
													<td class="py-2 print:py-1">
														<Show
															when={isPaid(order)}
															fallback={
																<span class="whitespace-nowrap rounded-full bg-error px-2 py-0.5 text-xs font-semibold text-error-foreground print:border print:border-black print:bg-transparent print:px-1.5 print:text-[8pt] print:text-black">
																	Not paid
																</span>
															}
														>
															<span class="whitespace-nowrap text-xs font-medium text-success-foreground print:text-[8pt] print:text-black">
																Paid
															</span>
														</Show>
													</td>
												</tr>
											)}
										</For>
									</tbody>
								</table>
							</div>
						</div>
					)}
				</For>
			</Show>
		</section>
	);
}
