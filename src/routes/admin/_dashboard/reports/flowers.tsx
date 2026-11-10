import * as Dialog from "@kobalte/core/dialog";
import { createFileRoute } from "@tanstack/solid-router";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";
import { Portal } from "solid-js/web";

import {
	createOrderList,
	drill,
	FilterTabs,
	isPaid,
	OrderList,
	useReport,
} from "~/components/admin/reports";
import { adminButton, adminCard, toastError } from "~/components/admin/ui";
import { BATTALIONS, battalionOf } from "~/lib/cadets";
import {
	type FlowerTally,
	flowerKey,
	orderFlowers,
	tallyFlowers,
} from "~/lib/flower-tally";
import { photoSrc } from "~/lib/photos";
import { cn } from "~/lib/utils";
import {
	getFlowerPurchases,
	type OrderGroup,
	type ReportLine,
	type ReportOrder,
	setFlowerPurchaseFn,
} from "~/server/admin/reports";
import type {
	FlowerPurchase,
	PurchaseStatus,
} from "~/server/flower-purchases-repo";

export const Route = createFileRoute("/admin/_dashboard/reports/flowers")({
	loader: () => getFlowerPurchases(),
	component: FlowersToBuy,
});

type FlowerRow = FlowerTally["colors"][number];

/** Bought rows go green and ordered ones amber, so what's left stands out. */
const rowTint = (purchase?: FlowerPurchase) =>
	purchase?.status === "bought"
		? "bg-success/40"
		: purchase?.status === "ordered"
			? "bg-warning/40"
			: undefined;

const STATUS_OPTIONS: { status: PurchaseStatus | null; label: string }[] = [
	{ status: null, label: "Not yet" },
	{ status: "ordered", label: "Ordered" },
	{ status: "bought", label: "Bought" },
];

/** Not yet / Ordered / Bought for one flower and color; says who set it. */
function StatusPicker(props: {
	name: string;
	purchase?: FlowerPurchase;
	onChange: (status: PurchaseStatus | null) => void;
}) {
	const current = () => props.purchase?.status ?? null;
	const who = () =>
		props.purchase
			? `${props.purchase.status === "bought" ? "Bought" : "Ordered"}, marked by ${props.purchase.updatedBy} on ${new Date(
					props.purchase.updatedAt,
				).toLocaleString("en-PH", {
					timeZone: "Asia/Manila",
					dateStyle: "medium",
					timeStyle: "short",
				})}`
			: "Not ordered or bought yet";
	return (
		<>
			<fieldset
				title={who()}
				class="m-0 inline-flex min-w-0 rounded-full border border-petal-200 bg-white p-0.5 text-xs print:hidden"
			>
				<legend class="sr-only">{props.name}: status</legend>
				<For each={STATUS_OPTIONS}>
					{(option) => (
						<button
							type="button"
							aria-pressed={current() === option.status}
							onClick={() =>
								current() !== option.status && props.onChange(option.status)
							}
							class={cn(
								"rounded-full px-2.5 py-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500",
								current() === option.status
									? option.status === "bought"
										? "bg-success font-semibold text-success-foreground ring-1 ring-success-foreground/50"
										: option.status === "ordered"
											? "bg-warning font-semibold text-warning-foreground ring-1 ring-warning-foreground/50"
											: "bg-petal-100 font-medium text-petal-900"
									: "text-petal-900/60 hover:bg-petal-50 hover:text-petal-900",
							)}
						>
							<Show when={current() === option.status && option.status}>
								<span aria-hidden="true">✓ </span>
							</Show>
							{option.label}
						</button>
					)}
				</For>
			</fieldset>
			<span class="hidden text-xs print:inline">
				{STATUS_OPTIONS.find((o) => o.status === current())?.label}
			</span>
		</>
	);
}

type FlowerFilter = "all" | "paid" | "unpaid";
/** A florist's id, everyone, or "none" for bouquets not given to anyone. */
type FloristFilter = string;

/** The flower (and color, if picked) whose bouquets are listed. */
interface FlowerPick {
	flower: string;
	filler: boolean;
	color?: string;
}
/** A battalion's name, everyone, or "none" for civilians and no company. */
type BattalionFilter = "all" | "none" | (typeof BATTALIONS)[number]["name"];

/**
 * Every flower the orders need, for buying: each bouquet's recipe times how
 * many were ordered, added up by flower and color. Cancelled orders aren't
 * counted.
 */
function FlowersToBuy() {
	const report = useReport();
	const list = createOrderList();
	const [filter, setFilter] = createSignal<FlowerFilter>("all");
	const [battalion, setBattalion] = createSignal<BattalionFilter>("all");
	const [florist, setFlorist] = createSignal<FloristFilter>("all");
	/** An order's bouquets for one florist (or not given to anyone). */
	const linesFor = (order: ReportOrder, key: FloristFilter): ReportLine[] =>
		key === "all"
			? order.lines
			: order.lines
					.map((line) => {
						const florists = line.florists.filter(
							(id) => (id || "none") === key,
						);
						return { ...line, florists, quantity: florists.length };
					})
					.filter((line) => line.quantity > 0);
	/** Each order with only the chosen florist's bouquets, and their flowers. */
	const scoped = (order: ReportOrder, key: FloristFilter) => {
		if (key === "all") return order;
		const lines = linesFor(order, key);
		const needs = orderFlowers(lines);
		return {
			...order,
			lines,
			flowers: needs.flowers,
			bouquetsWithoutRecipe: needs.missing,
		};
	};
	const notCancelled = createMemo(() =>
		report()
			.orders.filter((order) => order.status !== "cancelled")
			.map((order) => scoped(order, florist()))
			.filter((order) => order.lines.length > 0),
	);
	const inBattalion = (order: ReportOrder, key: BattalionFilter) =>
		key === "all" ||
		(key === "none"
			? !battalionOf(order.company)
			: battalionOf(order.company) === key);
	/** The orders in the chosen battalion; the payment tabs count from these. */
	const active = createMemo(() =>
		notCancelled().filter((order) => inBattalion(order, battalion())),
	);
	const battalionTabs: {
		key: BattalionFilter;
		label: string;
		count: () => number;
	}[] = [
		{ key: "all", label: "Everyone", count: () => notCancelled().length },
		...BATTALIONS.map((b) => ({
			key: b.name,
			label: b.name,
			count: () =>
				notCancelled().filter((order) => inBattalion(order, b.name)).length,
		})),
		{
			key: "none",
			label: "Civilians",
			count: () =>
				notCancelled().filter((order) => inBattalion(order, "none")).length,
		},
	];
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
	const allNotCancelled = createMemo(() =>
		report().orders.filter((order) => order.status !== "cancelled"),
	);
	const bouquetsOf = (key: FloristFilter) =>
		allNotCancelled()
			.filter((order) => inBattalion(order, battalion()))
			.reduce(
				(sum, order) =>
					sum + linesFor(order, key).reduce((n, line) => n + line.quantity, 0),
				0,
			);
	const floristTabs = () => [
		{ key: "all", label: "Everyone", count: () => bouquetsOf("all") },
		...report()
			.florists.filter((f) => f.active || bouquetsOf(f.id) > 0)
			.map((f) => ({
				key: f.id,
				label: f.name,
				count: () => bouquetsOf(f.id),
			})),
		{ key: "none", label: "Not assigned", count: () => bouquetsOf("none") },
	];
	const floristLabel = () =>
		florist() === "all"
			? ""
			: (floristTabs().find((t) => t.key === florist())?.label ?? "");
	const [picked, setPicked] = createSignal<FlowerPick | null>(null);
	const stems = (filler: boolean) =>
		tally()
			.filter((row) => row.filler === filler)
			.reduce((sum, row) => sum + row.stems, 0);
	const withoutRecipe = createMemo(() =>
		counted().filter((order) => order.bouquetsWithoutRecipe > 0),
	);
	const missing = () =>
		withoutRecipe().reduce(
			(sum, order) => sum + order.bouquetsWithoutRecipe,
			0,
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
			onClick={() => list.show(title, group(orderIds))}
			class={cn(drill, "px-1 tabular-nums")}
		>
			{orderIds.length}
		</button>
	);

	const [printing, setPrinting] = createSignal(false);
	/** Prints the supplier's checklist alone, then puts the page back. */
	const printForSupplier = () => {
		setPrinting(true);
		const done = () => setPrinting(false);
		window.addEventListener("afterprint", done, { once: true });
		requestAnimationFrame(() => {
			window.print();
			setTimeout(done, 1000);
		});
	};
	/** E.g. "3/4 Battalion · Paid (12)", for the printouts. */
	// Ordered / bought, per battalion filter: buying for 3/4 Battalion doesn't
	// mark 1/2 Battalion's flowers.
	const loaded = Route.useLoaderData();
	const [purchases, setPurchases] = createSignal<FlowerPurchase[]>(loaded());
	createEffect(on(loaded, setPurchases, { defer: true }));
	// Each florist gets their own flowers, so each keeps their own marks.
	const scopeKey = () =>
		florist() === "all" ? battalion() : `${battalion()}|${florist()}`;
	const purchaseOf = (row: FlowerRow) =>
		purchases().find(
			(p) => p.scope === scopeKey() && p.flowerKey === flowerKey(row),
		);
	const setStatus = async (row: FlowerRow, status: PurchaseStatus | null) => {
		const scope = scopeKey();
		const key = flowerKey(row);
		const before = purchases();
		setPurchases([
			...before.filter((p) => !(p.scope === scope && p.flowerKey === key)),
			...(status
				? [
						{
							scope,
							flowerKey: key,
							status,
							updatedBy: "you",
							updatedAt: new Date().toISOString(),
						},
					]
				: []),
		]);
		try {
			setPurchases(
				await setFlowerPurchaseFn({ data: { scope, flowerKey: key, status } }),
			);
		} catch (error) {
			setPurchases(before);
			toastError(error, "Couldn't save that. Try again.");
		}
	};
	const colorRows = () => tally().flatMap((flower) => flower.colors);
	const statusCount = (status: PurchaseStatus) =>
		colorRows().filter((row) => purchaseOf(row)?.status === status).length;
	const battalionLabel = () =>
		[
			battalion() === "all"
				? "everyone"
				: (battalionTabs.find((t) => t.key === battalion())?.label ?? ""),
			floristLabel(),
		]
			.filter(Boolean)
			.join(" · ");

	const tabLabel = () => {
		const tab = tabs.find((t) => t.key === filter());
		const unit = battalionTabs.find((t) => t.key === battalion());
		return [
			florist() === "all" ? "" : `Florist: ${floristLabel()}`,
			battalion() === "all" ? "" : unit?.label,
			tab ? `${tab.label} (${tab.count()})` : "",
		]
			.filter(Boolean)
			.join(" · ");
	};

	return (
		<section class={cn(adminCard, "p-5")} aria-labelledby="flowers-to-buy">
			<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
				<h2 id="flowers-to-buy" class="font-semibold">
					Flowers to buy
				</h2>
				<div class="flex flex-wrap items-center gap-3">
					<p class="text-sm tabular-nums text-petal-900/70">
						<strong class="font-semibold">{stems(false)}</strong> flowers
						<Show when={stems(true)}>
							{" · "}
							<strong class="font-semibold">{stems(true)}</strong> filler
						</Show>
					</p>
					<button
						type="button"
						onClick={printForSupplier}
						disabled={!tally().length}
						class={cn(adminButton.primary, "print:hidden")}
					>
						Print checklist for supplier
					</button>
				</div>
			</div>
			<Show when={printing()}>
				<Portal>
					<SupplierChecklist
						tally={tally()}
						counting={tabLabel()}
						flowers={stems(false)}
						filler={stems(true)}
						missing={missing()}
					/>
				</Portal>
			</Show>
			<p class="mb-4 text-sm text-petal-900/60">
				Every flower in the orders: each bouquet’s recipe times how many were
				ordered, added up by flower and color. Cancelled orders aren’t counted.
			</p>
			<Show when={report().florists.length}>
				<FilterTabs
					label="Florist"
					tabs={floristTabs()}
					value={florist()}
					onChange={setFlorist}
					class="mb-3"
				/>
			</Show>
			<div class="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
				<FilterTabs
					label="Battalion"
					tabs={battalionTabs}
					value={battalion()}
					onChange={setBattalion}
					class="mb-0"
				/>
				<FilterTabs
					label="Count flowers from"
					tabs={tabs}
					value={filter()}
					onChange={setFilter}
					class="mb-0"
				/>
			</div>
			<p class="mb-3 hidden text-sm print:block">Counting: {tabLabel()}</p>
			<Show when={withoutRecipe().length}>
				<p class="mb-4 rounded-xl bg-warning/60 px-3 py-2 text-sm text-warning-foreground">
					{missing()} bouquet(s) have no recipe on record, so their flowers
					aren’t counted.{" "}
					<button
						type="button"
						onClick={() =>
							list.show(
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
				<p class="mb-3 text-sm tabular-nums text-petal-900/70 print:hidden">
					<strong class="font-semibold text-success-foreground">
						{statusCount("bought")}
					</strong>{" "}
					bought ·{" "}
					<strong class="font-semibold text-warning-foreground">
						{statusCount("ordered")}
					</strong>{" "}
					ordered ·{" "}
					<strong class="font-semibold">
						{colorRows().length -
							statusCount("bought") -
							statusCount("ordered")}
					</strong>{" "}
					not yet
					<span class="text-petal-900/55">
						{" "}
						(for {battalionLabel()}; each battalion and florist keeps its own)
					</span>
				</p>
				<div class="overflow-x-auto print:overflow-visible">
					<table class="w-full min-w-[560px] max-w-4xl text-left text-sm print:min-w-0">
						<thead class="text-xs uppercase tracking-wide text-petal-900/55">
							<tr>
								<th class="pb-2 pr-4 font-medium">Flower</th>
								<th class="w-20 pb-2 pr-4 text-right font-medium">Stems</th>
								<th class="w-20 pb-2 pr-4 text-right font-medium">Bouquets</th>
								<th class="w-16 pb-2 pr-4 text-right font-medium">Orders</th>
								<th class="w-60 pb-2 font-medium">Status</th>
							</tr>
						</thead>
						<For each={tally()}>
							{(flower) => {
								const split = () =>
									flower.colors.length > 1 || flower.colors[0]?.color !== "";
								const bought = () =>
									flower.colors.filter(
										(row) => purchaseOf(row)?.status === "bought",
									).length;
								return (
									<tbody class="border-t border-petal-100 print:break-inside-avoid">
										<tr
											class={cn(
												!split() &&
													rowTint(purchaseOf(flower.colors[0] as FlowerRow)),
											)}
										>
											<th scope="row" class="py-2.5 pr-4 font-semibold">
												<button
													type="button"
													onClick={() =>
														setPicked({
															flower: flower.flower,
															filler: flower.filler,
														})
													}
													title="See the bouquets with this flower"
													class="rounded text-left underline decoration-petal-300 decoration-dotted underline-offset-4 outline-none hover:text-petal-700 hover:decoration-solid focus-visible:ring-2 focus-visible:ring-petal-500 print:no-underline"
												>
													{flower.flower}
												</button>
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
											<td class="py-2.5 pr-4 text-right">
												{ordersButton(
													`Flower: ${flower.flower}`,
													flower.orderIds,
												)}
											</td>
											<td class="py-2">
												<Show
													when={!split()}
													fallback={
														<span
															class={cn(
																"text-xs tabular-nums",
																bought() === flower.colors.length
																	? "font-semibold text-success-foreground"
																	: "text-petal-900/60",
															)}
														>
															{bought()} of {flower.colors.length} bought
														</span>
													}
												>
													<StatusPicker
														name={flower.flower}
														purchase={purchaseOf(flower.colors[0] as FlowerRow)}
														onChange={(status) =>
															void setStatus(
																flower.colors[0] as FlowerRow,
																status,
															)
														}
													/>
												</Show>
											</td>
										</tr>
										<Show when={split()}>
											<For each={flower.colors}>
												{(row) => (
													<tr
														class={cn(
															"text-petal-900/80",
															rowTint(purchaseOf(row)),
														)}
													>
														<th
															scope="row"
															class="py-1.5 pl-5 pr-4 font-normal"
														>
															<button
																type="button"
																onClick={() =>
																	setPicked({
																		flower: flower.flower,
																		filler: flower.filler,
																		color: row.color,
																	})
																}
																title="See the bouquets with this color"
																class="rounded text-left underline decoration-petal-300 decoration-dotted underline-offset-4 outline-none hover:text-petal-700 hover:decoration-solid focus-visible:ring-2 focus-visible:ring-petal-500 print:no-underline"
															>
																{row.color || "No color given"}
															</button>
														</th>
														<td class="py-1.5 pr-4 text-right tabular-nums">
															{amount(row)}
														</td>
														<td class="py-1.5 pr-4 text-right tabular-nums">
															{row.bouquets}
														</td>
														<td class="py-1.5 pr-4 text-right">
															{ordersButton(
																`Flower: ${flower.flower} · ${row.color || "No color"}`,
																row.orderIds,
															)}
														</td>
														<td class="py-1">
															<StatusPicker
																name={`${flower.flower}, ${row.color || "no color"}`}
																purchase={purchaseOf(row)}
																onChange={(status) =>
																	void setStatus(row, status)
																}
															/>
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
			<FlowerBouquets
				pick={picked()}
				orders={counted()}
				florists={report().florists}
				showFlorist={florist() === "all" && report().florists.length > 0}
				counting={tabLabel()}
				onClose={() => setPicked(null)}
				onOrders={(title, orderIds) => {
					setPicked(null);
					list.show(title, group(orderIds));
				}}
			/>
			<OrderList list={list} />
		</section>
	);
}

/** One style using the picked flower, across the counted orders. */
interface StyleUse {
	key: string;
	code: string;
	title: string;
	colorName: string;
	image?: string;
	bouquets: number;
	/** Stems of the flower in one bouquet (several colors added up). */
	each: number;
	stems: number;
	clusters: number;
	orderIds: string[];
	/** Bouquets per florist id ("" not assigned). */
	byFlorist: Map<string, number>;
}

/**
 * The bouquets to be made with one flower (or one of its colors): each style,
 * how many of it, how many stems each needs, and who's making them.
 */
function FlowerBouquets(props: {
	pick: FlowerPick | null;
	orders: ReportOrder[];
	florists: { id: string; name: string }[];
	showFlorist: boolean;
	counting: string;
	onClose: () => void;
	onOrders: (title: string, orderIds: string[]) => void;
}) {
	const name = () => {
		const pick = props.pick;
		if (!pick) return "";
		return pick.color !== undefined
			? `${pick.flower} · ${pick.color || "no color given"}`
			: pick.flower;
	};
	const uses = createMemo((): StyleUse[] => {
		const pick = props.pick;
		if (!pick) return [];
		const styles = new Map<string, StyleUse>();
		for (const order of props.orders) {
			for (const line of order.lines) {
				const items = line.recipe.filter(
					(item) =>
						item.flower === pick.flower &&
						!!item.filler === pick.filler &&
						(pick.color === undefined || (item.color ?? "") === pick.color),
				);
				if (!items.length) continue;
				const each = items.reduce((sum, item) => sum + (item.count ?? 0), 0);
				const clusters = items.filter((item) => !item.count).length;
				const key = `${line.code}|${line.title}|${line.colorName}|${each}`;
				const use: StyleUse = styles.get(key) ?? {
					key,
					code: line.code,
					title: line.title,
					colorName: line.colorName,
					image: line.image,
					bouquets: 0,
					each,
					stems: 0,
					clusters: 0,
					orderIds: [],
					byFlorist: new Map(),
				};
				use.bouquets += line.quantity;
				use.stems += each * line.quantity;
				use.clusters += clusters * line.quantity;
				if (!use.orderIds.includes(order.id)) use.orderIds.push(order.id);
				for (const id of line.florists.slice(0, line.quantity))
					use.byFlorist.set(id, (use.byFlorist.get(id) ?? 0) + 1);
				styles.set(key, use);
			}
		}
		return [...styles.values()].sort(
			(a, b) => b.stems - a.stems || b.bouquets - a.bouquets,
		);
	});
	const total = (pickOut: (use: StyleUse) => number) =>
		uses().reduce((sum, use) => sum + pickOut(use), 0);
	const allOrders = () => [...new Set(uses().flatMap((use) => use.orderIds))];
	const floristText = (use: StyleUse) =>
		[...use.byFlorist.entries()]
			.sort((a, b) => Number(!a[0]) - Number(!b[0]) || b[1] - a[1])
			.map(
				([id, n]) =>
					`${id ? (props.florists.find((f) => f.id === id)?.name ?? "Removed florist") : "Not assigned"} × ${n}`,
			)
			.join(", ");

	return (
		<Dialog.Root
			open={!!props.pick}
			onOpenChange={(open) => !open && props.onClose()}
		>
			<Dialog.Portal>
				<Dialog.Overlay class="fixed inset-0 z-50 bg-petal-900/40 print:hidden" />
				<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6 print:static print:block print:p-0">
					<Dialog.Content
						data-print-sheet
						class="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white text-petal-900 shadow-xl outline-none sm:rounded-2xl print:block print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none"
					>
						<div class="flex items-start justify-between gap-4 border-b border-petal-100 px-5 py-4 print:px-0">
							<div>
								<Dialog.Title class="text-lg font-semibold">
									Bouquets with {name()}
								</Dialog.Title>
								<Dialog.Description class="text-sm tabular-nums text-petal-900/65">
									{total((u) => u.bouquets)} bouquets · {total((u) => u.stems)}{" "}
									stems
									<Show when={total((u) => u.clusters)}>
										{" "}
										+ {total((u) => u.clusters)} clusters
									</Show>
									<Show when={props.counting}>
										<span class="block text-xs">
											Counting: {props.counting}
										</span>
									</Show>
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
									class="flex size-10 items-center justify-center rounded-full text-lg outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									✕
								</Dialog.CloseButton>
							</div>
						</div>
						<div class="overflow-y-auto px-5 py-3 print:overflow-visible print:px-0">
							<Show
								when={uses().length}
								fallback={
									<p class="py-6 text-center text-sm text-petal-900/60">
										No bouquets here use it.
									</p>
								}
							>
								<ul class="divide-y divide-petal-50">
									<For each={uses()}>
										{(use) => (
											<li class="flex items-center gap-3 py-3 print:break-inside-avoid">
												<span class="size-14 shrink-0 overflow-hidden rounded-xl bg-petal-50">
													<Show when={use.image}>
														{(src) => (
															<img
																src={photoSrc(src(), "thumb")}
																alt=""
																class="size-full object-cover"
															/>
														)}
													</Show>
												</span>
												<span class="min-w-0 flex-1">
													<span class="block font-medium leading-tight">
														{use.title}
														<span class="font-normal text-petal-900/60">
															{" "}
															· {use.colorName}
														</span>
													</span>
													<span class="block text-sm text-petal-900/65 tabular-nums">
														{use.code !== use.title ? `${use.code} · ` : ""}
														{use.each
															? `${use.each} ${use.each === 1 ? "stem" : "stems"} each`
															: "a cluster each"}
													</span>
													<Show when={props.showFlorist}>
														<span class="block text-xs text-petal-900/60">
															{floristText(use)}
														</span>
													</Show>
												</span>
												<span class="shrink-0 text-right tabular-nums">
													<span class="block text-lg font-semibold leading-tight">
														× {use.bouquets}
													</span>
													<Show when={use.stems}>
														<span class="block text-xs text-petal-900/60">
															{use.stems} stems
														</span>
													</Show>
												</span>
												<button
													type="button"
													onClick={() =>
														props.onOrders(
															`${use.title} · ${use.colorName} with ${name()}`,
															use.orderIds,
														)
													}
													class={cn(
														drill,
														"shrink-0 px-2 text-sm print:hidden",
													)}
												>
													{use.orderIds.length}{" "}
													{use.orderIds.length === 1 ? "order" : "orders"}
												</button>
											</li>
										)}
									</For>
								</ul>
							</Show>
						</div>
						<Show when={allOrders().length > 1}>
							<div class="border-t border-petal-100 px-5 py-3 text-right print:hidden">
								<button
									type="button"
									onClick={() =>
										props.onOrders(`Orders with ${name()}`, allOrders())
									}
									class={adminButton.secondary}
								>
									See all {allOrders().length} orders
								</button>
							</div>
						</Show>
					</Dialog.Content>
				</div>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/**
 * The flower order on paper, for the supplier: each flower and color with how
 * many stems, a box to tick and room to write what came. No customer details.
 */
function SupplierChecklist(props: {
	tally: FlowerTally[];
	/** Which orders it's for, e.g. "Paid (12)". */
	counting: string;
	flowers: number;
	filler: number;
	/** Bouquets with no recipe, so not counted. */
	missing: number;
}) {
	const today = new Date().toLocaleDateString("en-PH", {
		timeZone: "Asia/Manila",
		dateStyle: "long",
	});
	const quantity = (row: { stems: number; clusters: number }) =>
		[
			row.stems ? `${row.stems} stems` : "",
			row.clusters
				? `${row.clusters} cluster${row.clusters === 1 ? "" : "s"}`
				: "",
		]
			.filter(Boolean)
			.join(" + ");
	const rows = () =>
		props.tally.flatMap((flower) =>
			flower.colors.map((row) => ({ ...row, filler: flower.filler })),
		);
	const cell = "border border-black/40 px-2 py-2.5 align-middle";
	return (
		<div data-print-sheet class="hidden bg-white text-black print:block">
			<div class="mb-4 flex items-end justify-between gap-4 border-b-2 border-black pb-3">
				<div>
					<p class="text-xs uppercase tracking-widest">ORAIA · oraiashop.com</p>
					<h1 class="text-2xl font-bold">Flower order checklist</h1>
				</div>
				<div class="text-right text-sm">
					<p>
						Date: <strong>{today}</strong>
					</p>
					<p>For orders: {props.counting}</p>
				</div>
			</div>
			<table class="w-full border-collapse text-left text-sm">
				<thead>
					<tr class="bg-black/5">
						<th class={cn(cell, "w-10 text-center")}>✓</th>
						<th class={cell}>Flower</th>
						<th class={cell}>Color</th>
						<th class={cn(cell, "text-right")}>Quantity</th>
						<th class={cn(cell, "w-28")}>Received</th>
						<th class={cn(cell, "w-48")}>Notes</th>
					</tr>
				</thead>
				<tbody>
					<For each={rows()}>
						{(row) => (
							<tr class="break-inside-avoid">
								<td class={cn(cell, "text-center")}>
									<span class="inline-block size-4 border-2 border-black" />
								</td>
								<td class={cn(cell, "font-semibold")}>
									{row.flower}
									<Show when={row.filler}>
										<span class="font-normal"> (filler)</span>
									</Show>
								</td>
								<td class={cell}>{row.color || "—"}</td>
								<td
									class={cn(
										cell,
										"text-right text-base font-bold tabular-nums",
									)}
								>
									{quantity(row)}
								</td>
								<td class={cell} />
								<td class={cell} />
							</tr>
						)}
					</For>
				</tbody>
				<tfoot>
					<tr class="font-bold">
						<td class={cell} colSpan={3}>
							Total
						</td>
						<td class={cn(cell, "text-right tabular-nums")}>
							{props.flowers} stems
							<Show when={props.filler}>
								<span class="block text-xs font-normal">
									+ {props.filler} filler
								</span>
							</Show>
						</td>
						<td class={cell} />
						<td class={cell} />
					</tr>
				</tfoot>
			</table>
			<Show when={props.missing}>
				<p class="mt-3 text-xs">
					Not included: {props.missing} bouquet(s) with no recipe on record.
				</p>
			</Show>
			<div class="mt-12 grid grid-cols-3 gap-8 text-sm break-inside-avoid">
				<For each={["Ordered by", "Supplier", "Received by"]}>
					{(label) => (
						<div>
							<div class="h-10 border-b border-black" />
							<p class="mt-1">{label} · signature & date</p>
						</div>
					)}
				</For>
			</div>
		</div>
	);
}
