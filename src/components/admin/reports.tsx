/**
 * Pieces shared by the report pages: the clickable numbers, bars, and the
 * order list that opens behind any of them (with print and PDF/Excel export).
 */
import * as Dialog from "@kobalte/core/dialog";
import { getRouteApi, Link, useNavigate } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";

import { adminButton, adminCard, adminInput } from "~/components/admin/ui";
import { ColorSwatch, CompanyLabel } from "~/components/order/company-label";
import {
	PaymentStatusPill,
	paymentStatusLabel,
} from "~/components/order/payment-status";
import {
	BATTALIONS,
	battalionOf,
	CADET_CLASSES,
	CIVILIAN,
	COMPANIES,
	orderColor,
} from "~/lib/cadets";
import { formatPrice } from "~/lib/product";
import type { OrderBlock } from "~/lib/report-export";
import { cn } from "~/lib/utils";
import type {
	CountRow,
	OrderGroup,
	PaymentCell,
	PaymentRow,
	ReportOrder,
} from "~/server/admin/reports";
import { ORDER_STATUS_LABELS } from "~/types/order";

const reportRoute = getRouteApi("/admin/_dashboard/reports");

/** The report, loaded once by the Reports layout for every report page. */
export const useReport = () => reportRoute.useLoaderData();

/** Formats an amount in the report's currency. */
export function useMoney() {
	const report = useReport();
	return (amount: number) => formatPrice(amount, report().currency);
}

/** "1 order", "3 orders". */
export const count = (n: number, noun: string) =>
	`${n} ${noun}${n === 1 ? "" : "s"}`;

/** Staff marked it paid: the whole amount is in. */
export const isPaid = (order: ReportOrder) => order.received >= order.total;

/** Sorts by surname, as every printed list is. */
export const byName = (a: ReportOrder, b: ReportOrder) =>
	a.name.localeCompare(b.name);

export const groupOf = (orders: ReportOrder[]): OrderGroup => ({
	orders: orders.length,
	orderIds: orders.map((order) => order.id),
});

/** How many bouquets the orders add up to. */
export const bouquetCount = (orders: ReportOrder[]) =>
	orders.reduce(
		(sum, order) =>
			sum + order.bouquets.reduce((n, bouquet) => n + bouquet.quantity, 0),
		0,
	);

/** One block of orders in the list; a whole report has one per row. */
export interface ListSection {
	heading?: string;
	color?: string;
	group: OrderGroup;
}

/** What's open in the order list: a title and the orders behind it. */
export interface Selection {
	title: string;
	sections: ListSection[];
}

/** Which list is open on a report page, and ways to open one. */
export function createOrderList() {
	const [selected, setSelected] = createSignal<Selection | null>(null);
	return {
		selected,
		close: () => setSelected(null),
		show: (title: string, group: OrderGroup) =>
			setSelected({ title, sections: [{ group }] }),
		showRows: (title: string, rows: CountRow[]) =>
			setSelected({
				title,
				sections: rows.map((row) => ({
					heading: row.label,
					color: row.color,
					group: row,
				})),
			}),
		showSections: (title: string, sections: ListSection[]) =>
			setSelected({ title, sections }),
	};
}
export type OrderListState = ReturnType<typeof createOrderList>;

const SEPARATE_BY = [
	{ id: "report", label: "As it is" },
	{ id: "class", label: "Class" },
	{ id: "battalion", label: "Battalion" },
	{ id: "company", label: "Company" },
	{ id: "bouquet", label: "Bouquet" },
	{ id: "payment", label: "Payment" },
	{ id: "status", label: "Status" },
] as const;
type SeparateBy = (typeof SEPARATE_BY)[number]["id"];

/** Groups that have a natural order; anything else goes alphabetically after. */
const GROUP_ORDER: Partial<Record<SeparateBy, string[]>> = {
	class: [...CADET_CLASSES, CIVILIAN],
	battalion: [...BATTALIONS.map((battalion) => battalion.name), CIVILIAN],
	company: [...COMPANIES.map((company) => company.name), CIVILIAN],
	status: Object.values(ORDER_STATUS_LABELS),
};

/** Which groups an order falls in; several bouquets means several groups. */
function groupsOf(order: ReportOrder, by: SeparateBy): string[] {
	if (by === "class") return [order.className || "Not given"];
	const noCompany = order.className === CIVILIAN ? CIVILIAN : "No company";
	if (by === "battalion") return [battalionOf(order.company) ?? noCompany];
	if (by === "company") return [order.company || noCompany];
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

export type PaymentColumns = Pick<
	PaymentRow,
	"onHold" | "pending" | "paid" | "rejected" | "total"
>;

/** Adds one column up across every payment method. */
export function sumColumn(
	rows: PaymentRow[],
	column: keyof PaymentColumns,
): PaymentCell {
	return {
		orders: rows.reduce((sum, row) => sum + row[column].orders, 0),
		orderIds: rows.flatMap((row) => row[column].orderIds),
		amount: rows.reduce((sum, row) => sum + row[column].amount, 0),
	};
}

/** Shared look for every clickable number on the report pages. */
export const drill =
	"rounded-lg text-left outline-none transition-colors hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500";

/** The pill tabs that filter a report ("All", "Paid", …). */
export function FilterTabs<K extends string>(props: {
	label: string;
	tabs: { key: K; label: string; count?: () => number }[];
	value: K;
	onChange: (key: K) => void;
	class?: string;
}) {
	return (
		<div
			role="tablist"
			aria-label={props.label}
			class={cn("flex flex-wrap gap-2 print:hidden", props.class ?? "mb-4")}
		>
			<For each={props.tabs}>
				{(tab) => (
					<button
						type="button"
						role="tab"
						aria-selected={props.value === tab.key}
						onClick={() => props.onChange(tab.key)}
						class={cn(
							"rounded-full border px-3.5 py-1.5 text-sm transition-colors",
							props.value === tab.key
								? "border-petal-700 bg-petal-700 font-medium text-white"
								: "border-petal-200 bg-white hover:bg-petal-50",
						)}
					>
						{tab.label}
						<Show when={tab.count}>
							{(n) => <span class="tabular-nums opacity-80"> ({n()()})</span>}
						</Show>
					</button>
				)}
			</For>
		</div>
	);
}

/** How much of what was ordered is in hand, as a bar. */
export function CollectedBar() {
	const report = useReport();
	const money = useMoney();
	const percent = () => {
		const { ordered, received } = report().money;
		return ordered.amount > 0
			? Math.min(100, Math.round((received.amount / ordered.amount) * 100))
			: 0;
	};
	return (
		<div class={cn(adminCard, "mb-3 p-4")}>
			<div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
				<span class="font-medium">
					Collected {money(report().money.received.amount)} of{" "}
					{money(report().money.ordered.amount)}
				</span>
				<span class="tabular-nums text-petal-900/65">{percent()}%</span>
			</div>
			<div
				class="mt-2 h-3 overflow-hidden rounded-full bg-petal-100"
				role="progressbar"
				aria-label="Money collected"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={percent()}
			>
				<div
					class="h-full rounded-full bg-sage-600"
					style={{ width: `${percent()}%` }}
				/>
			</div>
		</div>
	);
}

/** A report's title: pressing it lists all of the report's orders. */
export function ReportHeading(props: {
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
export function PaymentCells(props: {
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

export function Stat(props: {
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
export function Bars(props: {
	rows: CountRow[];
	onOpen: (row: CountRow) => void;
}) {
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
export function OrderList(props: { list: OrderListState }) {
	const report = useReport();
	const currency = () => report().currency;
	const selection = () => props.list.selected();
	const [separateBy, setSeparateBy] = createSignal<SeparateBy>("report");
	const [newPages, setNewPages] = createSignal(true);
	// Every list opens the way the report shows it.
	createEffect(
		on(selection, () => {
			setSeparateBy("report");
			setNewPages(true);
		}),
	);
	const reportBlocks = createMemo((): OrderBlock[] =>
		(selection()?.sections ?? [])
			.map((section) => {
				const ids = new Set(section.group.orderIds);
				return {
					...section,
					orders: report()
						.orders.filter((o) => ids.has(o.id))
						.sort(byName),
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
			orders: [...block.orders].sort(byName),
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
				title: selection()?.title ?? "Orders",
				subtitle: summary(),
				blocks: sections(),
				newPages: newPages(),
				currency: currency(),
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
			open={!!selection()}
			onOpenChange={(open) => !open && props.list.close()}
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
									{selection()?.title}
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
							<Show when={orderCount() === 0}>
								<p class="px-5 py-10 text-center text-sm text-petal-900/60">
									No orders here yet. This list fills in as orders match it, for
									example once staff mark a payment as verified.
								</p>
							</Show>
							<For each={sections()}>
								{(section, index) => (
									<section
										class={cn(
											"print:mt-4",
											newPages() &&
												"print:break-before-page print:first:break-before-auto",
										)}
									>
										<Show when={section.heading}>
											<h3 class="flex items-center gap-2 bg-petal-50 px-5 py-2 text-sm font-semibold print:hidden">
												<SectionTitle section={section} currency={currency()} />
											</h3>
										</Show>
										<OrderTable
											orders={section.orders}
											currency={currency()}
											startAt={sections()
												.slice(0, index())
												.reduce((n, s) => n + s.orders.length, 0)}
											pageTitle={
												section.heading ? (
													<SectionTitle
														section={section}
														currency={currency()}
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

/** Who ordered, what, and how they paid; each row opens the order. */
export function OrderTable(props: {
	orders: ReportOrder[];
	currency: string;
	/** Printed in the table's head, so it repeats on every page it runs onto. */
	pageTitle?: JSX.Element;
	/** Rows in tables above this one, so the count runs on across them. */
	startAt?: number;
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
							colSpan={7}
							class="bg-petal-50 px-2 py-2 text-left text-sm font-semibold normal-case tracking-normal text-petal-900"
						>
							<span class="flex items-center gap-2">{props.pageTitle}</span>
						</th>
					</tr>
				</Show>
				<tr>
					<th class="py-2 pl-5 text-right font-medium print:pl-2">
						<span class="sr-only">Count</span>#
					</th>
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
					{(order, i) => (
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
								data-label="#"
								class="py-2.5 pl-5 text-xs tabular-nums text-petal-900/55 md:text-right print:pl-4 print:text-black/70"
								style={{
									// Company stripe; the outline keeps Bravo's white visible.
									"box-shadow": color(order)
										? `inset 6px 0 0 ${color(order)}, inset 7px 0 0 rgb(0 0 0 / 0.15)`
										: undefined,
								}}
							>
								{(props.startAt ?? 0) + i() + 1}
							</td>
							<td
								data-wide
								class="px-5 py-2.5 font-medium print:pl-4 print:pr-2"
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
