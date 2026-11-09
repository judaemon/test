import { createFileRoute } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";

import {
	createOrderList,
	drill,
	FilterTabs,
	isPaid,
	OrderList,
	useReport,
} from "~/components/admin/reports";
import { adminButton, adminCard } from "~/components/admin/ui";
import { BATTALIONS, battalionOf } from "~/lib/cadets";
import { type FlowerTally, tallyFlowers } from "~/lib/flower-tally";
import { cn } from "~/lib/utils";
import type { OrderGroup, ReportOrder } from "~/server/admin/reports";

export const Route = createFileRoute("/admin/_dashboard/reports/flowers")({
	component: FlowersToBuy,
});

type FlowerFilter = "all" | "paid" | "unpaid";
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
	const notCancelled = createMemo(() =>
		report().orders.filter((order) => order.status !== "cancelled"),
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
	const tabLabel = () => {
		const tab = tabs.find((t) => t.key === filter());
		const unit = battalionTabs.find((t) => t.key === battalion());
		return [
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
			<OrderList list={list} />
		</section>
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
