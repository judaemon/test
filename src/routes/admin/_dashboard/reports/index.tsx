import { createFileRoute, Link } from "@tanstack/solid-router";
import { createMemo, For, type JSX } from "solid-js";

import {
	bouquetCount,
	CollectedBar,
	count,
	createOrderList,
	isPaid,
	OrderList,
	Stat,
	useMoney,
	useReport,
} from "~/components/admin/reports";
import { adminCard } from "~/components/admin/ui";
import { BATTALIONS } from "~/lib/cadets";
import { tallyFlowers } from "~/lib/flower-tally";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/admin/_dashboard/reports/")({
	component: ReportSummary,
});

/** The headline numbers, with a card leading to each report. */
function ReportSummary() {
	const report = useReport();
	const money = useMoney();
	const list = createOrderList();
	const show = list.show;

	const active = createMemo(() =>
		report().orders.filter((order) => order.status !== "cancelled"),
	);
	const cash = createMemo(() =>
		active().filter((order) => order.paymentMethod === "cash"),
	);
	const cashUnpaid = () => cash().filter((order) => !isPaid(order));
	const flowers = createMemo(() =>
		tallyFlowers(active())
			.flatMap((flower) => flower.colors)
			.filter((row) => !row.filler)
			.reduce((sum, row) => sum + row.stems, 0),
	);
	const battalions = createMemo(() =>
		BATTALIONS.map((b) => {
			const orders = active().filter((order) =>
				(b.companies as readonly string[]).includes(order.company),
			);
			return { name: b.name, orders };
		}),
	);
	const topBouquet = () =>
		[...report().byBouquet].sort((a, b) => b.quantity - a.quantity)[0];

	return (
		<>
			<CollectedBar />
			<dl class="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat
					label="Active orders"
					value={String(report().active.orders)}
					hint={`${count(report().bouquets, "bouquet")} ordered`}
					onOpen={() => show("Active orders", report().active)}
				/>
				<Stat
					label="Ordered"
					value={money(report().money.ordered.amount)}
					hint={`${money(report().money.averageOrder)} on average`}
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
			</dl>

			<h2 class="mb-3 font-semibold">Reports</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
				<ReportCard
					to="/admin/reports/money"
					title="Money"
					lines={[
						`${money(report().money.verifying.amount)} waiting to be verified`,
						`${count(report().money.rejected.orders, "payment problem")}`,
					]}
				/>
				<ReportCard
					to="/admin/reports/orders"
					title="Orders"
					lines={[
						`${count(report().active.orders, "active order")} · ${report().cancelled.orders} cancelled`,
						"By status, class and company",
					]}
				/>
				<ReportCard
					to="/admin/reports/battalions"
					title="Battalions"
					lines={battalions().map(
						(b) =>
							`${b.name}: ${count(b.orders.length, "order")} · ${bouquetCount(b.orders)} bouquets`,
					)}
				/>
				<ReportCard
					to="/admin/reports/cash"
					title="Cash payments"
					lines={[
						`${count(cash().length, "order")} paying cash`,
						`${cashUnpaid().length} not paid yet · ${money(
							cash().reduce((sum, o) => sum + (o.total - o.received), 0),
						)} to collect`,
					]}
				/>
				<ReportCard
					to="/admin/reports/flowers"
					title="Flowers to buy"
					lines={[
						`${flowers()} flowers for every active order`,
						"Supplier checklist to print",
					]}
				/>
				<ReportCard
					to="/admin/reports/bouquets"
					title="Bouquets"
					lines={[
						`${count(report().byBouquet.length, "kind")} ordered`,
						topBouquet()
							? `Most ordered: ${topBouquet()?.code} (${topBouquet()?.quantity})`
							: "No orders yet",
					]}
				/>
			</div>

			<OrderList list={list} />
		</>
	);
}

function ReportCard(props: {
	to: string;
	title: string;
	lines: JSX.Element[];
}) {
	return (
		<Link
			to={props.to}
			class={cn(
				adminCard,
				"group block p-5 outline-none transition-colors hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500",
			)}
		>
			<span class="flex items-center justify-between gap-2 font-semibold">
				{props.title}
				<span
					aria-hidden="true"
					class="text-petal-700 transition-transform group-hover:translate-x-0.5"
				>
					→
				</span>
			</span>
			<For each={props.lines}>
				{(line) => (
					<span class="mt-1 block text-sm text-petal-900/65">{line}</span>
				)}
			</For>
		</Link>
	);
}
