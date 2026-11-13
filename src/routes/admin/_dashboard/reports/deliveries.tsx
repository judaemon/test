import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
	FilterTabs,
	isPaid,
	useMoney,
	useReport,
} from "~/components/admin/reports";
import { adminCard } from "~/components/admin/ui";
import { CLASS_OPTIONS, COMPANIES } from "~/lib/cadets";
import { formatDeliveryDate, formatSerialNumber } from "~/lib/checkout";
import { shortDeliveryDate, upcomingDeliveryDates } from "~/lib/delivery-dates";
import { photoSrc } from "~/lib/photos";
import { printFileName, usePrintTitle } from "~/lib/print-title";
import { cn } from "~/lib/utils";
import type { ReportLine, ReportOrder } from "~/server/admin/reports";

export const Route = createFileRoute("/admin/_dashboard/reports/deliveries")({
	// The day to open on, e.g. from Orders' "Print handover list".
	validateSearch: (search: Record<string, unknown>): { day?: string } => ({
		day:
			typeof search.day === "string" &&
			(search.day === "none" ||
				search.day === "all" ||
				/^\d{4}-\d{2}-\d{2}$/.test(search.day))
				? search.day
				: undefined,
	}),
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

/** Which orders are listed: to deliver (not cancelled), cancelled, or all. */
type Status = "deliver" | "cancelled" | typeof ALL;

/** What the list can be sorted by, in the order picked. */
type SortKey = "order" | "bouquet" | "class" | "name";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
	{ key: "order", label: "Order no." },
	{ key: "bouquet", label: "Bouquet" },
	{ key: "class", label: "Class" },
	{ key: "name", label: "Name" },
];

/**
 * One bouquet line of an order. An order with several bouquets gets a row for
 * each, the customer repeated, with `part` of `parts` tying them together.
 */
interface Row {
	order: ReportOrder;
	line: ReportLine;
	part: number;
	parts: number;
}

/**
 * Who gets a bouquet on each delivery day, by company and class: a list to
 * print and tick off on the day. Cancelled orders are left out unless asked
 * for, and a tally squares the counts with the Orders page.
 */
function Deliveries() {
	const report = useReport();
	const money = useMoney();
	const isCancelled = (order: ReportOrder) => order.status === "cancelled";
	const [status, setStatus] = createSignal<Status>("deliver");
	const inStatus = (s: Status, order: ReportOrder) =>
		s === ALL || (s === "cancelled") === isCancelled(order);
	const active = createMemo(() =>
		report().orders.filter((order) => inStatus(status(), order)),
	);
	const itemCount = (orders: ReportOrder[]) =>
		orders.reduce(
			(sum, order) =>
				sum + order.lines.reduce((n, line) => n + line.quantity, 0),
			0,
		);
	/** The same totals as the Orders page (real orders, every status), split up. */
	const tally = createMemo(() => {
		const all = report().orders;
		const toDeliver = all.filter((order) => !isCancelled(order));
		const cancelled = all.filter(isCancelled);
		return {
			orders: all.length,
			items: itemCount(all),
			toDeliver: { orders: toDeliver.length, items: itemCount(toDeliver) },
			cancelled: { orders: cancelled.length, items: itemCount(cancelled) },
			test: report().testOrders,
		};
	});

	// The event's days, then any other day an order has, then "no date yet".
	const days = createMemo(() => {
		const dates = new Set(report().deliveryDates);
		for (const order of active())
			if (order.deliveryDate) dates.add(order.deliveryDate);
		const list: string[] = [...dates].sort();
		if (active().some((order) => !order.deliveryDate)) list.push(NONE);
		return list.length > 1 ? [ALL, ...list] : list;
	});
	const firstDay = () =>
		upcomingDeliveryDates(report().deliveryDates)[0] ?? days()[0] ?? NONE;
	const [day, setDay] = createSignal<string | undefined>(
		Route.useSearch()().day,
	);
	const [klass, setKlass] = createSignal<string>(ALL);
	const [company, setCompany] = createSignal<string>(ALL);
	const [pagePerCompany, setPagePerCompany] = createSignal(false);
	const [sortBy, setSortBy] = createSignal<SortKey[]>(["order", "bouquet"]);
	const toggleSort = (key: SortKey) =>
		setSortBy((keys) =>
			keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
		);
	const shownDay = () => day() ?? firstDay();

	const onDay = (date: string, order: ReportOrder) =>
		date === ALL || (order.deliveryDate || NONE) === date;
	const dateOf = (order: ReportOrder) => order.deliveryDate || NONE;
	/** Dates in order, "no date yet" last. */
	const dateRank = (a: string, b: string) =>
		a === b ? 0 : a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b);
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

	// Florists are given bouquets, not orders: "" is a bouquet no one has yet.
	const [florist, setFlorist] = createSignal<string>(ALL);
	/** How many of a line's bouquets the florist has (all of them for everyone). */
	const unitsFor = (key: string, line: ReportLine) =>
		key === ALL
			? line.quantity
			: line.florists.filter((id) => id === key).length;
	const hasFlorist = (key: string, order: ReportOrder) =>
		order.lines.some((line) => unitsFor(key, line) > 0);
	const ofClassAndCompany = createMemo(() =>
		ofDay().filter(
			(order) =>
				(klass() === ALL || classOf(order) === klass()) &&
				(company() === ALL || companyOf(order) === company()),
		),
	);
	const shown = createMemo(() =>
		ofClassAndCompany().filter((order) => hasFlorist(florist(), order)),
	);
	const floristTabs = createMemo(() => {
		const known = report().florists;
		const keys = [
			...known
				.filter((f) => f.active || ofDay().some((o) => hasFlorist(f.id, o)))
				.map((f) => f.id),
			...(ofDay().some((o) => hasFlorist("", o)) ? [""] : []),
		];
		return keys.map((key) => ({
			key,
			label: key
				? (known.find((f) => f.id === key)?.name ?? key)
				: "Not assigned",
		}));
	});
	const floristLabel = (key: string) =>
		floristTabs().find((tab) => tab.key === key)?.label ?? "";

	const byNumber = (a: ReportOrder, b: ReportOrder) =>
		a.number.localeCompare(b.number, undefined, { numeric: true });
	const compare: Record<SortKey, (a: Row, b: Row) => number> = {
		order: (a, b) => byNumber(a.order, b.order),
		bouquet: (a, b) =>
			a.line.title.localeCompare(b.line.title) ||
			a.line.colorName.localeCompare(b.line.colorName),
		class: (a, b) =>
			classRank(a.order.className) - classRank(b.order.className),
		name: (a, b) => a.order.name.localeCompare(b.order.name),
	};

	/** By delivery day (earliest first, no date last), then company: "Nov 14 · Alpha". */
	const groups = createMemo(() => {
		const keys = [...sortBy(), "order", "bouquet"] as SortKey[];
		const rows: Row[] = shown().flatMap((order) =>
			order.lines.flatMap((line, i) => {
				// Only the florist's own bouquets of a line, when one is picked.
				const units = unitsFor(florist(), line);
				return units
					? [
							{
								order,
								line:
									units === line.quantity ? line : { ...line, quantity: units },
								part: i + 1,
								parts: order.lines.length,
							},
						]
					: [];
			}),
		);
		rows.sort((a, b) => {
			for (const key of keys) {
				const diff = compare[key](a, b);
				if (diff) return diff;
			}
			return a.part - b.part;
		});
		const byGroup = new Map<
			string,
			{ company: string; date: string; rows: Row[] }
		>();
		for (const row of rows) {
			const company = companyOf(row.order);
			const date = shownDay() === ALL ? dateOf(row.order) : shownDay();
			const key = `${company}\u0000${date}`;
			const group = byGroup.get(key) ?? { company, date, rows: [] };
			group.rows.push(row);
			byGroup.set(key, group);
		}
		return [...byGroup.values()].sort(
			(a, b) =>
				dateRank(a.date, b.date) ||
				companyRank(a.company) - companyRank(b.company) ||
				a.company.localeCompare(b.company),
		);
	});

	/** Each order once, from its rows. */
	const ordersOf = (rows: Row[]) => [...new Set(rows.map((row) => row.order))];
	/** The row that carries an order's amount to collect: its first one listed. */
	const isFirstListed = (rows: Row[], row: Row) =>
		rows.find((r) => r.order === row.order) === row;

	/** What's still owed on it, to collect at handover. */
	const owed = (order: ReportOrder) =>
		isCancelled(order) ? 0 : Math.max(0, order.total - order.received);
	const bouquetCount = (rows: Row[]) =>
		rows.reduce((sum, row) => sum + row.line.quantity, 0);
	const dayLabel = (date: string) =>
		date === ALL
			? "All dates"
			: date === NONE
				? "No date yet"
				: shortDeliveryDate(date);
	const classLabel = (name: string) => (name === NONE ? "No class" : name);
	const companyLabel = (name: string) => (name === NONE ? "No company" : name);

	// The saved PDF's name: "Deliveries - Sat, Nov 14 - 2CL - Delta - Nov 11".
	usePrintTitle(() =>
		printFileName([
			"Deliveries",
			dayLabel(shownDay()),
			status() === "cancelled" && "Cancelled",
			status() === ALL && "Incl. cancelled",
			klass() !== ALL && classLabel(klass()),
			company() !== ALL && companyLabel(company()),
			florist() !== ALL && floristLabel(florist()),
		]),
	);

	const pickStatus = (next: Status) => {
		setStatus(next);
		// The day picked may have none of these; all dates always has them.
		if (!days().includes(shownDay())) setDay(days()[0]);
		setKlass(ALL);
		setCompany(ALL);
	};

	const pickDay = (date: string) => {
		setDay(date);
		setKlass(ALL);
		setCompany(ALL);
	};

	return (
		<section class={cn(adminCard, "p-5 print:border-0 print:p-0")}>
			{/* A4, like the florist's sheets; the other reports print on letter. */}
			<style>{"@page { size: A4 portrait; margin: 10mm; }"}</style>
			<div class="print:hidden">
				<h2 class="mb-1 font-semibold">Deliveries</h2>
				<p class="mb-4 text-sm text-petal-900/60">
					The handover list: who gets a bouquet on each day, by company and
					class, with what’s left to collect and room to sign. Pick a day (or
					All dates) and narrow it down, then print. Each bouquet has its own
					row, so an order with two bouquets is listed twice under the same
					order number. Give orders their day in Orders, in the Delivery date
					column.
				</p>
				{/* Squares with Orders: its "Total ordered" counts every status, test orders aside. */}
				<div class="mb-4 rounded-xl border border-petal-100 bg-petal-50/60 px-3.5 py-2.5 text-sm text-petal-900/75">
					<p>
						<strong class="font-semibold text-petal-900 tabular-nums">
							{tally().orders} orders · {tally().items} items
						</strong>{" "}
						in all, the same as Total ordered in{" "}
						<Link
							to="/admin/orders"
							class="font-medium text-petal-700 underline-offset-2 hover:underline"
						>
							Orders
						</Link>
						:
					</p>
					<p class="tabular-nums">
						{tally().toDeliver.orders} to deliver ({tally().toDeliver.items}{" "}
						items) + {tally().cancelled.orders} cancelled (
						{tally().cancelled.items} items)
						<Show when={tally().test.orders}>
							{" "}
							· {tally().test.orders} test{" "}
							{tally().test.orders === 1 ? "order" : "orders"} (
							{tally().test.items} items) not counted anywhere
						</Show>
					</p>
				</div>
				<div class="mb-3 flex flex-wrap items-center gap-x-2">
					<span class="mr-1 text-sm font-medium">Status</span>
					<FilterTabs
						label="Status"
						tabs={(
							[
								["deliver", "To deliver"],
								["cancelled", "Cancelled"],
								[ALL, "All"],
							] as const
						).map(([key, label]) => ({
							key: key as Status,
							label,
							count: () =>
								report().orders.filter((order) => inStatus(key, order)).length,
						}))}
						value={status()}
						onChange={pickStatus}
						class="mb-0"
					/>
				</div>
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
					<Show when={floristTabs().length}>
						<div class="mb-3 flex flex-wrap items-center gap-x-2">
							<span class="mr-1 text-sm font-medium">Florist</span>
							<FilterTabs
								label="Florist"
								tabs={[{ key: ALL, label: "Everyone" }, ...floristTabs()].map(
									(tab) => ({
										...tab,
										count: () =>
											ofClassAndCompany().filter((order) =>
												hasFlorist(tab.key, order),
											).length,
									}),
								)}
								value={florist()}
								onChange={setFlorist}
								class="mb-0"
							/>
						</div>
					</Show>
					<label class="mb-4 flex min-h-10 w-fit cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={pagePerCompany()}
							onChange={(e) => setPagePerCompany(e.currentTarget.checked)}
							class="size-5 accent-petal-700"
						/>
						Print each company on its own page
					</label>
					<div class="mb-4 flex flex-wrap items-center gap-2">
						<span class="mr-1 text-sm font-medium">Sort by</span>
						<For each={SORT_OPTIONS}>
							{(option) => {
								const rank = () => sortBy().indexOf(option.key) + 1;
								return (
									<button
										type="button"
										aria-pressed={rank() > 0}
										onClick={() => toggleSort(option.key)}
										class={cn(
											"inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
											rank()
												? "border-petal-700 bg-petal-700 font-medium text-white"
												: "border-petal-200 bg-white hover:bg-petal-50",
										)}
									>
										<Show when={rank() && sortBy().length > 1}>
											<span class="flex size-5 items-center justify-center rounded-full bg-white text-xs font-semibold tabular-nums text-petal-700">
												{rank()}
											</span>
										</Show>
										{option.label}
									</button>
								);
							}}
						</For>
						<span class="text-xs text-petal-900/55">
							Pick one or more; the first one picked sorts first.
						</span>
					</div>
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
					{(group, index) => (
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
										{group.date === NONE
											? "No date yet"
											: formatDeliveryDate(group.date)}
										<Show when={klass() !== ALL}> · {classLabel(klass())}</Show>
									</p>
									<h3 class="font-display text-xl font-semibold leading-tight print:text-[16pt]">
										{companyLabel(group.company)}
										<Show when={shownDay() === ALL}>
											<span class="font-normal text-petal-900/60 print:text-black/60">
												{" · "}
												{dayLabel(group.date)}
											</span>
										</Show>
									</h3>
								</div>
								<p class="text-sm tabular-nums text-petal-900/70 print:text-[9pt] print:text-black">
									{ordersOf(group.rows).length}{" "}
									{ordersOf(group.rows).length === 1 ? "order" : "orders"} ·{" "}
									{bouquetCount(group.rows)}{" "}
									{bouquetCount(group.rows) === 1 ? "bouquet" : "bouquets"}
									<Show
										when={ordersOf(group.rows).reduce(
											(sum, o) => sum + owed(o),
											0,
										)}
									>
										{(total) => (
											<>
												{" · "}
												<strong class="font-semibold">{money(total())}</strong>{" "}
												to collect
											</>
										)}
									</Show>
								</p>
							</header>
							<div class="overflow-x-auto print:overflow-visible">
								<table class="w-full min-w-[720px] text-left text-sm print:min-w-0 print:text-[9pt]">
									<thead class="text-xs uppercase tracking-wide text-petal-900/55 print:text-[7.5pt] print:text-black/70">
										<tr>
											<th class="w-8 pb-1.5 pr-2 font-medium">
												<span class="sr-only">Handed over</span>✓
											</th>
											<th class="pb-1.5 pr-3 font-medium">Order</th>
											<th class="pb-1.5 pr-3 font-medium">Delivery</th>
											<th class="pb-1.5 pr-3 font-medium">Name</th>
											<th class="pb-1.5 pr-3 font-medium">Class</th>
											<th class="pb-1.5 pr-3 font-medium">Serial no.</th>
											<th class="pb-1.5 pr-3 font-medium">Bouquets</th>
											<th class="pb-1.5 pr-3 text-right font-medium">
												To collect
											</th>
											<th class="w-[18%] pb-1.5 font-medium">Signature</th>
										</tr>
									</thead>
									<tbody>
										<For each={group.rows}>
											{(row) => (
												<tr
													class={cn(
														"border-t border-petal-100 align-top print:break-inside-avoid print:border-black/25",
														row.parts > 1 &&
															"bg-petal-50/60 print:bg-transparent",
														isCancelled(row.order) && "text-petal-900/50",
													)}
												>
													<td class="py-2 pr-2 print:py-1">
														<span class="inline-block size-4 rounded-sm border-2 border-petal-900/40 print:border-black" />
													</td>
													<td class="py-2 pr-3 font-semibold tabular-nums print:py-1">
														<Link
															to="/admin/orders/$orderId"
															params={{ orderId: row.order.id }}
															class="underline-offset-2 hover:underline print:no-underline"
														>
															#{row.order.number}
														</Link>
														<Show when={row.parts > 1}>
															<span class="block whitespace-nowrap text-xs font-normal text-petal-900/60 print:text-[7.5pt] print:text-black/70">
																{row.part} of {row.parts} in this order
															</span>
														</Show>
													</td>
													<td class="whitespace-nowrap py-2 pr-3 print:py-1">
														{dayLabel(dateOf(row.order))}
													</td>
													<td class="py-2 pr-3 font-medium print:py-1">
														{row.order.name}
													</td>
													<td class="py-2 pr-3 print:py-1">
														{row.order.className || "—"}
													</td>
													<td class="whitespace-nowrap py-2 pr-3 tabular-nums print:py-1">
														{row.order.serialNumber
															? formatSerialNumber(row.order.serialNumber)
															: "—"}
													</td>
													<td class="py-2 pr-3 print:py-1">
														<Show when={row.line} keyed>
															{(line) => (
																<span class="flex items-center gap-2 leading-snug [&+&]:mt-1">
																	{/* Small, and never cropped, so the bouquet is easy to spot by its colors. */}
																	<span class="flex size-12 shrink-0 items-center justify-center print:size-[12mm]">
																		<Show when={line.image}>
																			{(src) => (
																				<img
																					src={photoSrc(src(), "thumb")}
																					alt=""
																					class="max-h-full max-w-full rounded object-contain"
																				/>
																			)}
																		</Show>
																	</span>
																	<span>
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
																</span>
															)}
														</Show>
													</td>
													<td class="py-2 pr-3 text-right print:py-1">
														<Show
															when={!isCancelled(row.order)}
															fallback={
																<span class="whitespace-nowrap rounded-full bg-petal-100 px-2 py-0.5 text-xs font-medium text-petal-900/70 print:border print:border-black print:bg-transparent print:text-[8pt] print:text-black">
																	Cancelled
																</span>
															}
														>
															<Show
																when={!isPaid(row.order)}
																fallback={
																	<span class="whitespace-nowrap text-xs font-medium text-success-foreground print:text-[8pt] print:text-black">
																		Paid
																	</span>
																}
															>
																<Show
																	when={isFirstListed(group.rows, row)}
																	fallback={
																		<span class="whitespace-nowrap text-xs text-petal-900/55 print:text-[8pt] print:text-black/60">
																			With #{row.order.number} above
																		</span>
																	}
																>
																	<span class="whitespace-nowrap rounded-full bg-error px-2 py-0.5 text-xs font-semibold tabular-nums text-error-foreground print:border print:border-black print:bg-transparent print:px-1.5 print:text-[9pt] print:text-black">
																		{money(owed(row.order))}
																	</span>
																</Show>
															</Show>
														</Show>
													</td>
													{/* Room for the customer to sign as they take their bouquet. */}
													<td class="py-2 print:h-[11mm] print:py-1">
														<span class="block h-full min-h-8 border-b border-petal-900/30 print:min-h-0 print:border-black/50" />
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
