import * as Dialog from "@kobalte/core/dialog";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";

import {
	adminButton,
	adminCard,
	adminInput,
	PageHeader,
} from "~/components/admin/ui";
import { ColorSwatch, CompanyLabel } from "~/components/order/company-label";
import {
	PaymentStatusPill,
	paymentStatusLabel,
} from "~/components/order/payment-status";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { CADET_CLASSES, CIVILIAN, COMPANIES, orderColor } from "~/lib/cadets";
import { formatSerialNumber } from "~/lib/checkout";
import { tallyFlowers } from "~/lib/flower-tally";
import { formatPrice } from "~/lib/product";
import type { OrderBlock } from "~/lib/report-export";
import { cn } from "~/lib/utils";
import {
	type CountRow,
	getReport,
	type OrderGroup,
	type PaymentCell,
	type PaymentRow,
	type ReportOrder,
} from "~/server/admin/reports";
import { ORDER_STATUS_LABELS } from "~/types/order";

export const Route = createFileRoute("/admin/_dashboard/reports")({
	loader: () => getReport(),
	component: ReportsPage,
});

/** One block of orders in the list; a whole report has one per row. */
interface ListSection {
	heading?: string;
	color?: string;
	group: OrderGroup;
}

/** What's open in the order list: a title and the orders behind it. */
interface Selection {
	title: string;
	sections: ListSection[];
}

const SEPARATE_BY = [
	{ id: "report", label: "As it is" },
	{ id: "class", label: "Class" },
	{ id: "company", label: "Company" },
	{ id: "bouquet", label: "Bouquet" },
	{ id: "payment", label: "Payment" },
	{ id: "status", label: "Status" },
] as const;
type SeparateBy = (typeof SEPARATE_BY)[number]["id"];

/** Groups that have a natural order; anything else goes alphabetically after. */
const GROUP_ORDER: Partial<Record<SeparateBy, string[]>> = {
	class: [...CADET_CLASSES, CIVILIAN],
	company: [...COMPANIES.map((company) => company.name), CIVILIAN],
	status: Object.values(ORDER_STATUS_LABELS),
};

/** Which groups an order falls in; several bouquets means several groups. */
function groupsOf(order: ReportOrder, by: SeparateBy): string[] {
	if (by === "class") return [order.className || "Not given"];
	if (by === "company")
		return [
			order.company || (order.className === CIVILIAN ? CIVILIAN : "No company"),
		];
	if (by === "bouquet")
		return [...new Set(order.bouquets.map((b) => `${b.code} · ${b.title}`))];
	if (by === "payment") return [order.paymentLabel];
	return [ORDER_STATUS_LABELS[order.status]];
}

function separate(orders: ReportOrder[], by: SeparateBy): OrderBlock[] {
	const groups = new Map<string, ReportOrder[]>();
	for (const order of orders)
		for (const group of groupsOf(order, by))
			groups.set(group, [...(groups.get(group) ?? []), order]);
	const known = GROUP_ORDER[by] ?? [];
	const rank = (group: string) => {
		const at = known.indexOf(group);
		return at === -1 ? known.length : at;
	};
	return [...groups]
		.sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
		.map(([heading, list]) => {
			const first = list[0] as ReportOrder;
			return {
				heading,
				color:
					by === "company"
						? orderColor(first.company, first.className)
						: undefined,
				orders: list,
			};
		});
}

type PaymentColumns = Pick<
	PaymentRow,
	"onHold" | "pending" | "paid" | "rejected" | "total"
>;

/** Adds one column up across every payment method. */
function sumColumn(
	rows: PaymentRow[],
	column: keyof PaymentColumns,
): PaymentCell {
	return {
		orders: rows.reduce((sum, row) => sum + row[column].orders, 0),
		orderIds: rows.flatMap((row) => row[column].orderIds),
		amount: rows.reduce((sum, row) => sum + row[column].amount, 0),
	};
}

/** Shared look for every clickable number on the page. */
const drill =
	"rounded-lg text-left outline-none transition-colors hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500";

function ReportsPage() {
	const report = Route.useLoaderData();
	const money = (amount: number) => formatPrice(amount, report().currency);
	const [selected, setSelected] = createSignal<Selection | null>(null);
	const show = (title: string, group: OrderGroup) =>
		setSelected({ title, sections: [{ group }] });
	const showRows = (title: string, rows: CountRow[]) =>
		setSelected({
			title,
			sections: rows.map((row) => ({
				heading: row.label,
				color: row.color,
				group: row,
			})),
		});
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
		setSelected({
			title: "Payments by method",
			sections: report().payments.flatMap((row) =>
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
		});
	/** "1 order", "3 orders". */
	const count = (n: number, noun: string) =>
		`${n} ${noun}${n === 1 ? "" : "s"}`;
	/** How much of what was ordered is in hand, 0–100. */
	const collectedPercent = () => {
		const { ordered, received } = report().money;
		return ordered.amount > 0
			? Math.min(100, Math.round((received.amount / ordered.amount) * 100))
			: 0;
	};
	const showBouquets = () =>
		setSelected({
			title: "Orders by bouquet",
			sections: report().byBouquet.map((row) => ({
				heading: `${row.code} · ${row.name}`,
				group: row,
			})),
		});

	return (
		<div class="pb-16 print:pb-0">
			{/* Short bond paper. Only here: dedication cards set their own size. */}
			<style>{"@page { size: letter; margin: 12mm; }"}</style>
			<PageHeader
				title="Reports"
				description="Active orders only: everything except cancelled orders. Click a report's title to list all its orders, or any number to see who ordered."
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

			<section class="mb-6" aria-labelledby="money-heading">
				<h2 id="money-heading" class="mb-1 font-semibold">
					Money
				</h2>
				<p class="mb-3 text-sm text-petal-900/60">
					Every order except cancelled ones; Cancelled shows those. Received
					counts verified and card payments, and down payments on orders that
					still owe the rest.
				</p>
				<div class={cn(adminCard, "mb-3 p-4")}>
					<div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
						<span class="font-medium">
							Collected {money(report().money.received.amount)} of{" "}
							{money(report().money.ordered.amount)}
						</span>
						<span class="tabular-nums text-petal-900/65">
							{collectedPercent()}%
						</span>
					</div>
					<div
						class="mt-2 h-3 overflow-hidden rounded-full bg-petal-100"
						role="progressbar"
						aria-label="Money collected"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={collectedPercent()}
					>
						<div
							class="h-full rounded-full bg-sage-600"
							style={{ width: `${collectedPercent()}%` }}
						/>
					</div>
				</div>
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

			<div class="mb-6 grid gap-5 lg:grid-cols-2">
				<section class={cn(adminCard, "p-5")} aria-labelledby="by-class">
					<ReportHeading
						id="by-class"
						title="Orders per class"
						onOpen={() => showRows("Orders per class", report().byClass)}
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
						onOpen={() => showRows("Orders per company", report().byCompany)}
					/>
					<Bars
						rows={report().byCompany}
						onOpen={(row) => show(`Company: ${row.label}`, row)}
					/>
				</section>
			</div>

			<section
				class={cn(adminCard, "mb-6 overflow-x-auto p-5 print:overflow-visible")}
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

			<CashPayments orders={report().orders} money={money} />

			<FlowersToBuy orders={report().orders} onOpen={show} />

			<section
				class={cn(adminCard, "overflow-x-auto p-5 print:overflow-visible")}
				aria-labelledby="by-bouquet"
			>
				<ReportHeading
					id="by-bouquet"
					title="Orders by bouquet"
					onOpen={showBouquets}
				/>
				<Show
					when={report().byBouquet.length > 0}
					fallback={<p class="text-sm text-petal-900/60">No orders yet.</p>}
				>
					<table class="w-full min-w-[560px] text-left text-sm print:min-w-0">
						<thead class="text-xs uppercase tracking-wide text-petal-900/55">
							<tr>
								<th class="pb-2 pr-4 font-medium">Bouquet</th>
								<th class="pb-2 pr-4 text-right font-medium">Orders</th>
								<th class="pb-2 pr-4 text-right font-medium">Bouquets</th>
								<th class="pb-2 text-right font-medium">Sales</th>
							</tr>
						</thead>
						<tbody>
							<For each={report().byBouquet}>
								{(row) => (
									<tr
										class="cursor-pointer border-t border-petal-100 transition-colors hover:bg-petal-50"
										onClick={(event) => {
											if ((event.target as HTMLElement).closest("button"))
												return;
											show(`Bouquet: ${row.code}`, row);
										}}
									>
										<th scope="row" class="py-2.5 pr-4 font-normal">
											<span class="flex items-center gap-3">
												<Show when={row.image}>
													{(src) => (
														<ZoomableImage
															src={src()}
															alt={row.name}
															caption={row.code}
															hoverPreview
															class="size-11 rounded-lg border border-black/10 object-cover"
														/>
													)}
												</Show>
												<button
													type="button"
													onClick={() => show(`Bouquet: ${row.code}`, row)}
													class={cn(drill, "px-1")}
												>
													<span class="block font-semibold">{row.code}</span>
													<span class="text-xs text-petal-900/60">
														{row.name}
													</span>
												</button>
											</span>
										</th>
										<td class="py-2.5 pr-4 text-right tabular-nums">
											{row.orders}
										</td>
										<td class="py-2.5 pr-4 text-right font-semibold tabular-nums">
											{row.quantity}
										</td>
										<td class="py-2.5 text-right tabular-nums">
											{money(row.sales)}
										</td>
									</tr>
								)}
							</For>
						</tbody>
						<tfoot>
							<tr class="border-t-2 border-petal-200 font-semibold">
								<th scope="row" class="py-3 pr-4 font-semibold">
									Total
								</th>
								<td class="py-3 pr-4 text-right tabular-nums">
									{report().active.orders}
								</td>
								<td class="py-3 pr-4 text-right tabular-nums">
									{report().byBouquet.reduce(
										(sum, row) => sum + row.quantity,
										0,
									)}
								</td>
								<td class="py-3 text-right tabular-nums">
									{money(
										report().byBouquet.reduce((sum, row) => sum + row.sales, 0),
									)}
								</td>
							</tr>
						</tfoot>
					</table>
				</Show>
			</section>

			<OrderList
				selection={selected()}
				onClose={() => setSelected(null)}
				currency={report().currency}
			/>
		</div>
	);
}

/** A report's title: pressing it lists all of the report's orders. */
function ReportHeading(props: {
	id: string;
	title: string;
	onOpen: () => void;
	class?: string;
}) {
	return (
		<div
			class={cn(
				"flex items-center justify-between gap-3",
				props.class ?? "mb-4",
			)}
		>
			<h2 id={props.id} class="font-semibold">
				<button
					type="button"
					onClick={props.onOpen}
					class={cn(drill, "px-1 underline-offset-2 hover:underline")}
				>
					{props.title}
				</button>
			</h2>
			<button
				type="button"
				onClick={props.onOpen}
				class="shrink-0 rounded-full px-2 py-2 text-sm text-petal-700 underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500 print:hidden"
			>
				View & print
			</button>
		</div>
	);
}

/** One method's row of the payments table; every amount opens its orders. */
function PaymentCells(props: {
	label: string;
	row: PaymentColumns;
	money: (amount: number) => string;
	onOpen: (title: string, group: OrderGroup) => void;
}) {
	const columns = () =>
		[
			["On hold", props.row.onHold],
			["Pending", props.row.pending],
			["Paid", props.row.paid],
			["Rejected", props.row.rejected],
			["Total", props.row.total],
		] as const;
	return (
		<For each={columns()}>
			{([status, cell], i) => (
				<td class={cn("py-2 text-right", i() < 4 && "pr-4")}>
					<button
						type="button"
						disabled={cell.orders === 0}
						onClick={() => props.onOpen(`${props.label} · ${status}`, cell)}
						class={cn(
							drill,
							"ml-auto block px-2 py-1 text-right tabular-nums disabled:pointer-events-none",
						)}
					>
						<span class="block font-semibold">
							{cell.orders} {cell.orders === 1 ? "order" : "orders"}
						</span>
						<span
							class={cn(
								"text-xs",
								status === "Total"
									? "font-semibold text-petal-900"
									: "text-petal-900/60",
							)}
						>
							{props.money(cell.amount)}
						</span>
					</button>
				</td>
			)}
		</For>
	);
}

function Stat(props: {
	label: string;
	value: string;
	hint?: string;
	onOpen: () => void;
}) {
	return (
		<div class={cn(adminCard, "p-1")}>
			<button
				type="button"
				onClick={props.onOpen}
				class={cn(drill, "block w-full p-3")}
			>
				<dt class="text-xs font-medium uppercase tracking-wide text-petal-900/55">
					{props.label}
				</dt>
				<dd class="mt-1 font-display type-soft text-3xl font-semibold tabular-nums">
					{props.value}
				</dd>
				<Show when={props.hint}>
					<dd class="mt-0.5 text-xs text-petal-900/60">{props.hint}</dd>
				</Show>
			</button>
		</div>
	);
}

/** One bar per row, scaled to the largest; the count is written beside it. */
function Bars(props: { rows: CountRow[]; onOpen: (row: CountRow) => void }) {
	const max = () => Math.max(1, ...props.rows.map((row) => row.orders));
	return (
		<ul class="flex flex-col gap-1">
			<For each={props.rows}>
				{(row) => (
					<li>
						<button
							type="button"
							disabled={row.orders === 0}
							onClick={() => props.onOpen(row)}
							title={`${row.label}: ${row.orders} ${row.orders === 1 ? "order" : "orders"}. Click to see who ordered.`}
							class={cn(
								drill,
								"grid w-full grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 px-2 py-1.5 text-sm disabled:pointer-events-none",
							)}
						>
							<span class="flex items-center gap-2 truncate">
								<Show when={row.color}>
									{(color) => <ColorSwatch color={color()} class="size-3" />}
								</Show>
								{row.label}
							</span>
							<span class="h-2.5 rounded-r-[4px] bg-petal-100">
								<span
									class="block h-full rounded-r-[4px] bg-petal-700"
									style={{ width: `${(row.orders / max()) * 100}%` }}
								/>
							</span>
							<span class="text-right font-semibold tabular-nums">
								{row.orders}
							</span>
						</button>
					</li>
				)}
			</For>
		</ul>
	);
}

/** The orders behind a report or number: who ordered, what, how they paid. */
function OrderList(props: {
	selection: Selection | null;
	onClose: () => void;
	currency: string;
}) {
	const report = Route.useLoaderData();
	const [separateBy, setSeparateBy] = createSignal<SeparateBy>("report");
	const [newPages, setNewPages] = createSignal(true);
	// Every list opens the way the report shows it.
	createEffect(
		on(
			() => props.selection,
			() => {
				setSeparateBy("report");
				setNewPages(true);
			},
		),
	);
	const reportBlocks = createMemo((): OrderBlock[] =>
		(props.selection?.sections ?? [])
			.map((section) => {
				const ids = new Set(section.group.orderIds);
				return {
					...section,
					orders: report()
						.orders.filter((o) => ids.has(o.id))
						.sort((a, b) => a.name.localeCompare(b.name)),
				};
			})
			.filter((section) => section.orders.length > 0),
	);
	const sections = createMemo((): OrderBlock[] => {
		if (separateBy() === "report") return reportBlocks();
		const orders = new Map(
			reportBlocks().flatMap((block) => block.orders.map((o) => [o.id, o])),
		);
		return separate([...orders.values()], separateBy()).map((block) => ({
			...block,
			orders: [...block.orders].sort((a, b) => a.name.localeCompare(b.name)),
		}));
	});
	const separateLabel = () =>
		SEPARATE_BY.find((option) => option.id === separateBy())?.label ?? "";
	const orderCount = () =>
		new Set(sections().flatMap((s) => s.orders.map((o) => o.id))).size;
	const summary = () =>
		`${orderCount()} ${orderCount() === 1 ? "order" : "orders"} · sorted by surname${
			separateBy() === "report"
				? ""
				: ` · separated by ${separateLabel().toLowerCase()}`
		}`;
	const [exporting, setExporting] = createSignal<"pdf" | "excel" | null>(null);
	const [exportFailed, setExportFailed] = createSignal(false);
	const exportList = async (format: "pdf" | "excel") => {
		setExporting(format);
		setExportFailed(false);
		try {
			const { exportOrdersExcel, exportOrdersPdf } = await import(
				"~/lib/report-export"
			);
			await (format === "pdf" ? exportOrdersPdf : exportOrdersExcel)({
				title: props.selection?.title ?? "Orders",
				subtitle: summary(),
				blocks: sections(),
				newPages: newPages(),
				currency: props.currency,
				paymentStatusLabel,
			});
		} catch (error) {
			console.error(error);
			setExportFailed(true);
		} finally {
			setExporting(null);
		}
	};

	return (
		<Dialog.Root
			open={!!props.selection}
			onOpenChange={(open) => !open && props.onClose()}
		>
			<Dialog.Portal>
				<Dialog.Overlay class="fixed inset-0 z-50 bg-petal-900/40 print:hidden" />
				<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6 print:static print:block print:p-0">
					<Dialog.Content
						data-print-sheet
						class="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white text-petal-900 shadow-xl outline-none sm:rounded-2xl print:block print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none"
					>
						<div class="flex items-start justify-between gap-4 border-b border-petal-100 px-5 py-4 print:px-0">
							<div>
								<p class="hidden text-xs uppercase tracking-wide text-petal-900/60 print:block">
									ORAIA report · {new Date().toLocaleDateString("en-PH")}
								</p>
								<Dialog.Title class="text-lg font-semibold">
									{props.selection?.title}
								</Dialog.Title>
								<Dialog.Description class="text-sm text-petal-900/60">
									{summary()}
								</Dialog.Description>
							</div>
							<div class="flex shrink-0 items-center gap-2 print:hidden">
								<button
									type="button"
									onClick={() => window.print()}
									class={adminButton.secondary}
								>
									Print
								</button>
								<Dialog.CloseButton
									aria-label="Close"
									class="flex size-10 items-center justify-center rounded-full text-lg hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									✕
								</Dialog.CloseButton>
							</div>
						</div>
						<div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-petal-100 px-5 py-2.5 text-sm print:hidden">
							<label class="flex items-center gap-2 font-medium">
								Separate by
								<select
									onChange={(e) =>
										setSeparateBy(e.currentTarget.value as SeparateBy)
									}
									class={cn(adminInput, "w-auto font-normal")}
								>
									<For each={SEPARATE_BY}>
										{(option) => (
											<option
												value={option.id}
												selected={separateBy() === option.id}
											>
												{option.label}
											</option>
										)}
									</For>
								</select>
							</label>
							<label class="flex min-h-10 cursor-pointer items-center gap-2">
								<input
									type="checkbox"
									checked={newPages()}
									onChange={(e) => setNewPages(e.currentTarget.checked)}
									class="size-5 accent-petal-700"
								/>
								New page for each group
							</label>
							<div class="flex items-center gap-2 sm:ml-auto">
								<Show when={exportFailed()}>
									<span role="alert" class="text-error-foreground">
										Couldn't export. Try again.
									</span>
								</Show>
								<button
									type="button"
									disabled={!!exporting() || orderCount() === 0}
									onClick={() => void exportList("pdf")}
									class={adminButton.secondary}
								>
									{exporting() === "pdf" ? "Exporting…" : "Export PDF"}
								</button>
								<button
									type="button"
									disabled={!!exporting() || orderCount() === 0}
									onClick={() => void exportList("excel")}
									class={adminButton.secondary}
								>
									{exporting() === "excel" ? "Exporting…" : "Export Excel"}
								</button>
							</div>
						</div>
						<div class="overflow-auto print:overflow-visible">
							<For each={sections()}>
								{(section) => (
									<section
										class={cn(
											"print:mt-4",
											newPages() &&
												"print:break-before-page print:first:break-before-auto",
										)}
									>
										<Show when={section.heading}>
											<h3 class="flex items-center gap-2 bg-petal-50 px-5 py-2 text-sm font-semibold print:hidden">
												<SectionTitle
													section={section}
													currency={props.currency}
												/>
											</h3>
										</Show>
										<OrderTable
											orders={section.orders}
											currency={props.currency}
											pageTitle={
												section.heading ? (
													<SectionTitle
														section={section}
														currency={props.currency}
													/>
												) : undefined
											}
										/>
									</section>
								)}
							</For>
						</div>
					</Dialog.Content>
				</div>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/** "● Alfa · 2 orders · ₱5,000" above a block of orders. */
function SectionTitle(props: { section: OrderBlock; currency: string }) {
	return (
		<>
			<Show when={props.section.color}>
				{(color) => <ColorSwatch color={color()} class="size-3" />}
			</Show>
			{props.section.heading}
			<span class="font-normal text-petal-900/60">
				· {props.section.orders.length}{" "}
				{props.section.orders.length === 1 ? "order" : "orders"} ·{" "}
				{formatPrice(
					props.section.orders.reduce((sum, o) => sum + o.total, 0),
					props.currency,
				)}
			</span>
		</>
	);
}

function OrderTable(props: {
	orders: ReportOrder[];
	currency: string;
	/** Printed in the table's head, so it repeats on every page it runs onto. */
	pageTitle?: JSX.Element;
}) {
	const navigate = useNavigate();
	// Each row is filled with its company's color, like the orders page.
	const color = (order: ReportOrder) =>
		orderColor(order.company, order.className);
	return (
		<table class="stack-table w-full text-left text-sm">
			<thead class="text-xs uppercase tracking-wide text-petal-900/55">
				<Show when={props.pageTitle}>
					<tr class="hidden print:table-row">
						<th
							colSpan={6}
							class="bg-petal-50 px-2 py-2 text-left text-sm font-semibold normal-case tracking-normal text-petal-900"
						>
							<span class="flex items-center gap-2">{props.pageTitle}</span>
						</th>
					</tr>
				</Show>
				<tr>
					<th class="px-5 py-2 font-medium print:px-2">Name</th>
					<th class="px-3 py-2 font-medium print:px-2">Company · Class</th>
					<th class="px-3 py-2 font-medium print:px-2">Bouquets</th>
					<th class="px-3 py-2 font-medium print:px-2">Payment</th>
					<th class="px-3 py-2 text-right font-medium print:px-2">Total</th>
					<th class="px-5 py-2 font-medium print:px-2">Order</th>
				</tr>
			</thead>
			<tbody>
				<For each={props.orders}>
					{(order) => (
						<tr
							// The whole row opens the order; the order number stays a
							// real link for keyboard users and opening in a new tab.
							onClick={(event) => {
								if ((event.target as HTMLElement).closest("a, button")) return;
								if (window.getSelection()?.toString()) return;
								if (event.ctrlKey || event.metaKey) {
									window.open(`/admin/orders/${order.id}`, "_blank");
									return;
								}
								void navigate({
									to: "/admin/orders/$orderId",
									params: { orderId: order.id },
								});
							}}
							class="cursor-pointer break-inside-avoid border-b border-black/5 align-top transition-[filter] hover:brightness-[0.95]"
							style={{
								"background-color": color(order)
									? `${color(order)}2e`
									: undefined,
							}}
						>
							<td
								data-wide
								class="px-5 py-2.5 font-medium print:pl-4 print:pr-2"
								style={{
									// Company stripe; the outline keeps Bravo's white visible.
									"box-shadow": color(order)
										? `inset 6px 0 0 ${color(order)}, inset 7px 0 0 rgb(0 0 0 / 0.15)`
										: undefined,
								}}
							>
								{order.name}
							</td>
							<td
								data-label="Company · Class"
								class="px-5 py-2 md:px-3 print:px-2"
							>
								<CompanyLabel
									company={order.company}
									className={order.className}
								/>
							</td>
							<td data-label="Bouquets" class="px-5 py-2 md:px-3 print:px-2">
								{order.bouquets
									.map((b) =>
										b.quantity > 1 ? `${b.code} × ${b.quantity}` : b.code,
									)
									.join(", ")}
							</td>
							<td data-label="Payment" class="px-5 py-2 md:px-3 print:px-2">
								<PaymentStatusPill status={order.paymentStatus} />
								<span class="mt-0.5 block text-xs text-petal-900/60">
									{order.paymentLabel}
								</span>
								<span class="block font-mono text-xs">
									Ref: {order.referenceNumber || "—"}
								</span>
							</td>
							<td
								data-label="Total"
								class="px-5 py-2 tabular-nums md:px-3 md:text-right print:px-2"
							>
								{formatPrice(order.total, props.currency)}
							</td>
							<td data-label="Order" data-wide class="px-5 py-2 print:px-2">
								<Link
									to="/admin/orders/$orderId"
									params={{ orderId: order.id }}
									class="font-semibold text-petal-700 underline-offset-2 hover:underline"
								>
									#{order.number}
								</Link>
								<span class="block text-xs text-petal-900/55">
									{ORDER_STATUS_LABELS[order.status]}
								</span>
								<Show when={order.cancelReason}>
									<span class="block max-w-48 text-xs text-error-foreground">
										{order.cancelReason}
									</span>
								</Show>
							</td>
						</tr>
					)}
				</For>
			</tbody>
		</table>
	);
}

type CashFilter = "all" | "unpaid" | "paid";

/**
 * Everyone paying in cash to 1st Class RICARDE, and whether staff have marked
 * their order paid: a checklist for collecting. Cancelled orders are left out.
 */
function CashPayments(props: {
	orders: ReportOrder[];
	money: (amount: number) => string;
}) {
	const [filter, setFilter] = createSignal<CashFilter>("all");
	/** Staff marked it paid: the whole amount is in. */
	const isPaid = (order: ReportOrder) => order.received >= order.total;
	const cash = createMemo(() =>
		props.orders
			.filter(
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
		<section
			class={cn(adminCard, "mb-6 p-5 print:break-before-page")}
			aria-labelledby="cash-payments"
		>
			<div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
				<h2 id="cash-payments" class="font-semibold">
					Cash payments · 1st Class RICARDE (Foxtrot)
				</h2>
				<p class="text-sm tabular-nums text-petal-900/70">
					Collected{" "}
					<strong class="font-semibold">{props.money(collected())}</strong>
					{" · "}Still to collect{" "}
					<strong class="font-semibold text-error-foreground">
						{props.money(owed())}
					</strong>
				</p>
			</div>
			<p class="mb-4 text-sm text-petal-900/60">
				Everyone who chose cash, not counting cancelled orders. Paid means staff
				verified the cash on the order’s page.
			</p>
			<div
				role="tablist"
				aria-label="Show"
				class="mb-4 flex flex-wrap gap-2 print:hidden"
			>
				<For each={tabs}>
					{(tab) => (
						<button
							type="button"
							role="tab"
							aria-selected={filter() === tab.key}
							onClick={() => setFilter(tab.key)}
							class={cn(
								"rounded-full border px-3.5 py-1.5 text-sm transition-colors",
								filter() === tab.key
									? "border-petal-700 bg-petal-700 font-medium text-white"
									: "border-petal-200 bg-white hover:bg-petal-50",
							)}
						>
							{tab.label}{" "}
							<span class="tabular-nums opacity-80">({tab.count()})</span>
						</button>
					)}
				</For>
			</div>
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
								{(order) => (
									<tr class="border-t border-petal-100">
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
											{props.money(order.total)}
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
																({props.money(order.received)} in)
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

type FlowerFilter = "all" | "paid" | "unpaid";

/**
 * Every flower the orders need, for buying: each bouquet's recipe times how
 * many were ordered, added up by flower and color. Cancelled orders aren't
 * counted.
 */
function FlowersToBuy(props: {
	orders: ReportOrder[];
	onOpen: (title: string, group: OrderGroup) => void;
}) {
	const [filter, setFilter] = createSignal<FlowerFilter>("all");
	const isPaid = (order: ReportOrder) => order.received >= order.total;
	const active = createMemo(() =>
		props.orders.filter((order) => order.status !== "cancelled"),
	);
	const counted = createMemo(() =>
		active().filter((order) =>
			filter() === "paid"
				? isPaid(order)
				: filter() === "unpaid"
					? !isPaid(order)
					: true,
		),
	);
	const tally = createMemo(() => tallyFlowers(counted()));
	const stems = (filler: boolean) =>
		tally()
			.filter((row) => row.filler === filler)
			.reduce((sum, row) => sum + row.stems, 0);
	const withoutRecipe = createMemo(() =>
		counted().filter((order) => order.bouquetsWithoutRecipe > 0),
	);
	const group = (orderIds: string[]): OrderGroup => ({
		orders: orderIds.length,
		orderIds,
	});
	const tabs: { key: FlowerFilter; label: string; count: () => number }[] = [
		{ key: "all", label: "All orders", count: () => active().length },
		{
			key: "paid",
			label: "Paid",
			count: () => active().filter(isPaid).length,
		},
		{
			key: "unpaid",
			label: "Not paid yet",
			count: () => active().filter((order) => !isPaid(order)).length,
		},
	];
	const amount = (row: { stems: number; clusters: number }) =>
		[
			row.stems ? String(row.stems) : "",
			row.clusters
				? `${row.clusters} cluster${row.clusters === 1 ? "" : "s"}`
				: "",
		]
			.filter(Boolean)
			.join(" + ");
	const ordersButton = (title: string, orderIds: string[]) => (
		<button
			type="button"
			onClick={() => props.onOpen(title, group(orderIds))}
			class={cn(drill, "px-1 tabular-nums")}
		>
			{orderIds.length}
		</button>
	);

	return (
		<section
			class={cn(adminCard, "mb-6 p-5 print:break-before-page")}
			aria-labelledby="flowers-to-buy"
		>
			<div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
				<h2 id="flowers-to-buy" class="font-semibold">
					Flowers to buy
				</h2>
				<p class="text-sm tabular-nums text-petal-900/70">
					<strong class="font-semibold">{stems(false)}</strong> flowers
					<Show when={stems(true)}>
						{" · "}
						<strong class="font-semibold">{stems(true)}</strong> filler
					</Show>
				</p>
			</div>
			<p class="mb-4 text-sm text-petal-900/60">
				Every flower in the orders: each bouquet’s recipe times how many were
				ordered, added up by flower and color. Cancelled orders aren’t counted.
			</p>
			<div
				role="tablist"
				aria-label="Count flowers from"
				class="mb-4 flex flex-wrap gap-2 print:hidden"
			>
				<For each={tabs}>
					{(tab) => (
						<button
							type="button"
							role="tab"
							aria-selected={filter() === tab.key}
							onClick={() => setFilter(tab.key)}
							class={cn(
								"rounded-full border px-3.5 py-1.5 text-sm transition-colors",
								filter() === tab.key
									? "border-petal-700 bg-petal-700 font-medium text-white"
									: "border-petal-200 bg-white hover:bg-petal-50",
							)}
						>
							{tab.label}{" "}
							<span class="tabular-nums opacity-80">({tab.count()})</span>
						</button>
					)}
				</For>
			</div>
			<p class="mb-3 hidden text-sm print:block">
				Counting: {tabs.find((tab) => tab.key === filter())?.label}
			</p>
			<Show when={withoutRecipe().length}>
				<p class="mb-4 rounded-xl bg-warning/60 px-3 py-2 text-sm text-warning-foreground">
					{withoutRecipe().reduce(
						(sum, order) => sum + order.bouquetsWithoutRecipe,
						0,
					)}{" "}
					bouquet(s) have no recipe on record, so their flowers aren’t counted.{" "}
					<button
						type="button"
						onClick={() =>
							props.onOpen(
								"Bouquets with no recipe",
								group(withoutRecipe().map((order) => order.id)),
							)
						}
						class="font-medium underline underline-offset-2 print:hidden"
					>
						See the orders
					</button>
				</p>
			</Show>
			<Show
				when={tally().length}
				fallback={
					<p class="text-sm text-petal-900/60">No flowers to count here.</p>
				}
			>
				<div class="overflow-x-auto print:overflow-visible">
					<table class="w-full min-w-[480px] text-left text-sm print:min-w-0">
						<thead class="text-xs uppercase tracking-wide text-petal-900/55">
							<tr>
								<th class="pb-2 pr-4 font-medium">Flower</th>
								<th class="pb-2 pr-4 text-right font-medium">Stems</th>
								<th class="pb-2 pr-4 text-right font-medium">Bouquets</th>
								<th class="pb-2 text-right font-medium">Orders</th>
							</tr>
						</thead>
						<For each={tally()}>
							{(flower) => {
								const split = () =>
									flower.colors.length > 1 || flower.colors[0]?.color !== "";
								return (
									<tbody class="border-t border-petal-100 print:break-inside-avoid">
										<tr>
											<th scope="row" class="py-2.5 pr-4 font-semibold">
												{flower.flower}
												<Show when={flower.filler}>
													<span class="ml-2 rounded-full bg-petal-100 px-2 py-0.5 text-xs font-medium">
														Filler
													</span>
												</Show>
											</th>
											<td class="py-2.5 pr-4 text-right font-semibold tabular-nums">
												{amount(flower)}
											</td>
											<td class="py-2.5 pr-4 text-right tabular-nums">
												<Show when={!split()}>
													{flower.colors[0]?.bouquets}
												</Show>
											</td>
											<td class="py-2.5 text-right">
												{ordersButton(
													`Flower: ${flower.flower}`,
													flower.orderIds,
												)}
											</td>
										</tr>
										<Show when={split()}>
											<For each={flower.colors}>
												{(row) => (
													<tr class="text-petal-900/80">
														<th
															scope="row"
															class="py-1.5 pl-5 pr-4 font-normal"
														>
															{row.color || "No color given"}
														</th>
														<td class="py-1.5 pr-4 text-right tabular-nums">
															{amount(row)}
														</td>
														<td class="py-1.5 pr-4 text-right tabular-nums">
															{row.bouquets}
														</td>
														<td class="py-1.5 text-right">
															{ordersButton(
																`Flower: ${flower.flower} · ${row.color || "No color"}`,
																row.orderIds,
															)}
														</td>
													</tr>
												)}
											</For>
										</Show>
									</tbody>
								);
							}}
						</For>
					</table>
				</div>
			</Show>
		</section>
	);
}
