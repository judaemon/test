import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/solid-router";
import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js";

import { CompanyLabel } from "~/components/order/company-label";
import { OrderStatusPill } from "~/components/order/payment-status";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { rememberedOrderId } from "~/lib/my-orders";
import { formatPrice } from "~/lib/product";
import { listActiveOrders } from "~/server/orders";
import { type ActiveOrder, ORDER_STATUS_LABELS } from "~/types/order";

/** Keeps statuses moving without a reload. */
const REFRESH_MS = 60_000;

export const Route = createFileRoute("/active-orders")({
	loader: () => listActiveOrders(),
	head: () => ({
		meta: [
			{ title: "Active orders · ORAIA" },
			{ name: "robots", content: "noindex" },
		],
	}),
	component: ActiveOrdersPage,
});

function ActiveOrdersPage() {
	const orders = Route.useLoaderData();
	const router = useRouter();
	const [query, setQuery] = createSignal("");

	onMount(() => {
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") router.invalidate();
		}, REFRESH_MS);
		onCleanup(() => clearInterval(timer));
	});

	const visible = createMemo(() => {
		const words = query().toLowerCase().split(/\s+/).filter(Boolean);
		return orders().filter((order) => {
			const text = [
				order.number,
				order.fullName,
				order.className,
				order.company,
				ORDER_STATUS_LABELS[order.status],
			]
				.join(" ")
				.toLowerCase();
			return words.every((word) => text.includes(word));
		});
	});

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6 lg:px-8">
				<h1 class="font-display type-soft text-4xl font-semibold tracking-tight">
					Active orders
				</h1>
				<p class="mt-2 max-w-2xl text-petal-900/70">
					Find your name to see how your order is doing. No account needed. If
					your order is on hold, tap its status to pay for it.
				</p>

				<label class="mt-6 block sm:max-w-sm">
					<span class="sr-only">Search orders</span>
					<input
						type="search"
						value={query()}
						onInput={(e) => setQuery(e.currentTarget.value)}
						placeholder="Search name, class or company"
						class="h-11 w-full rounded-xl border border-petal-200 bg-white px-3 text-base placeholder:text-petal-900/35 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 sm:text-sm"
					/>
				</label>

				<div class="relative mt-5 overflow-x-auto rounded-2xl border border-petal-100 bg-white">
					<table class="stack-table w-full text-left text-sm">
						<thead class="border-b border-petal-100 text-xs uppercase tracking-wide text-petal-900/55">
							<tr>
								<th class="px-4 py-3 font-medium">Class</th>
								<th class="px-4 py-3 font-medium">Company</th>
								<th class="px-4 py-3 font-medium">Full name</th>
								<th class="px-4 py-3 font-medium">Order(s)</th>
								<th class="px-4 py-3 text-right font-medium">Amount</th>
								<th class="px-4 py-3 font-medium">Status</th>
							</tr>
						</thead>
						<tbody>
							<For
								each={visible()}
								fallback={
									<tr>
										<td
											colSpan={6}
											data-wide
											class="px-4 py-12 text-center text-petal-900/55"
										>
											{orders().length
												? "No orders match your search."
												: "No active orders yet."}
										</td>
									</tr>
								}
							>
								{(order) => <OrderRow order={order} />}
							</For>
						</tbody>
					</table>
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}

function OrderRow(props: { order: ActiveOrder }) {
	const navigate = useNavigate();
	const order = () => props.order;
	const payable = () =>
		order().status === "on_hold" || order().status === "payment_check";

	return (
		<tr class="border-b border-petal-100 align-top last:border-0">
			<td data-label="Class" class="px-4 py-2 md:py-3">
				{order().className || "—"}
			</td>
			<td data-label="Company" class="px-4 py-2 md:py-3">
				<CompanyLabel
					company={order().company}
					className={order().className}
					companyOnly
				/>
			</td>
			<td
				data-label="Full name"
				data-wide
				class="px-4 py-2 font-medium md:py-3"
			>
				{order().fullName}
			</td>
			<td data-label="Order(s)" data-wide class="px-4 py-2 md:py-3">
				<For each={order().items}>{(item) => <p>{item}</p>}</For>
			</td>
			<td
				data-label="Amount"
				class="px-4 py-2 font-medium tabular-nums md:py-3 md:text-right"
			>
				{formatPrice(order().total, order().currency)}
			</td>
			<td data-label="Status" class="px-4 py-2 md:py-3">
				<button
					type="button"
					disabled={!payable()}
					onClick={() =>
						navigate({
							to: "/pay/$orderNumber",
							params: { orderNumber: order().number },
							search: { key: rememberedOrderId(order().number) },
						})
					}
					aria-label={
						payable()
							? `${ORDER_STATUS_LABELS[order().status]}: pay for order ${order().number}`
							: undefined
					}
					class="group inline-flex min-h-10 flex-col items-start gap-0.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-petal-500 disabled:min-h-0 md:min-h-0"
				>
					<OrderStatusPill status={order().status} />
					{payable() && (
						<span class="text-xs font-medium text-petal-700 underline underline-offset-2">
							Pay now
						</span>
					)}
				</button>
			</td>
		</tr>
	);
}
