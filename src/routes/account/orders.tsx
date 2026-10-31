import { createFileRoute, Link, useRouter } from "@tanstack/solid-router";
import {
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";

import {
	OrderTracker,
	ReorderButton,
} from "~/components/account/order-tracker";
import { pillPrimary } from "~/components/cart/cart-sheet";
import { orderDay, orderFor } from "~/lib/checkout";
import { formatPrice, styleLabel } from "~/lib/product";
import { formatDate } from "~/lib/time";
import { listMyOrders } from "~/server/account";
import { ACTIVE_STAGES, type CustomerOrder } from "~/types/order";

/** Active orders refresh so the tracker moves without a reload. */
const REFRESH_MS = 60_000;

export const Route = createFileRoute("/account/orders")({
	loader: () => listMyOrders(),
	head: () => ({ meta: [{ title: "Your orders · ORAIA" }] }),
	component: OrdersPage,
});

function OrdersPage() {
	const orders = Route.useLoaderData();
	const router = useRouter();
	const active = createMemo(() =>
		orders()
			.filter((order) => ACTIVE_STAGES.includes(order.stage))
			// Oldest first: it's the one we'll finish next.
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
	);
	const past = createMemo(() =>
		orders().filter((order) => !ACTIVE_STAGES.includes(order.stage)),
	);

	onMount(() => {
		const timer = setInterval(() => {
			if (document.visibilityState === "visible" && active().length > 0) {
				router.invalidate();
			}
		}, REFRESH_MS);
		onCleanup(() => clearInterval(timer));
	});

	return (
		<Show when={orders().length > 0} fallback={<NoOrders />}>
			<section aria-labelledby="active-heading">
				<h2 id="active-heading" class="mb-4 text-lg font-semibold">
					On their way{" "}
					<span class="font-normal text-petal-900/55">({active().length})</span>
				</h2>
				<Show
					when={active().length > 0}
					fallback={
						<p class="rounded-3xl border border-dashed border-petal-200 px-5 py-8 text-center text-sm text-petal-900/60">
							Nothing on its way right now.
						</p>
					}
				>
					<div class="flex flex-col gap-5">
						<For each={active()}>
							{(order) => <OrderTracker order={order} />}
						</For>
					</div>
				</Show>
			</section>

			<Show when={past().length > 0}>
				<section aria-labelledby="past-heading" class="mt-12">
					<h2 id="past-heading" class="mb-4 text-lg font-semibold">
						Past orders
					</h2>
					<ul class="flex flex-col gap-3">
						<For each={past()}>{(order) => <PastOrder order={order} />}</For>
					</ul>
				</section>
			</Show>
		</Show>
	);
}

/** Deliveries this recent open expanded, so the delivery photo is right there. */
const RECENT_DELIVERY_MS = 24 * 60 * 60 * 1000;

function PastOrder(props: { order: CustomerOrder }) {
	const order = () => props.order;
	const deliveredAt = props.order.delivery.deliveredAt;
	const [expanded, setExpanded] = createSignal(
		!!deliveredAt && Date.now() - Date.parse(deliveredAt) < RECENT_DELIVERY_MS,
	);
	const detailsId = `past-${props.order.id}`;
	return (
		<li class="rounded-3xl border border-petal-100 bg-white p-4">
			<div class="flex flex-wrap items-center gap-4">
				<img
					src={order().lines[0]?.image}
					alt=""
					class="size-16 shrink-0 rounded-2xl bg-petal-50 object-cover"
				/>
				<div class="min-w-0 flex-1">
					<p class="font-medium">
						{order()
							.lines.map((line) => `${line.quantity} × ${styleLabel(line)}`)
							.join(", ")}
					</p>
					<p class="text-sm text-petal-900/60">
						{order().stage === "cancelled" ? "Cancelled" : "Delivered"} ·{" "}
						{formatDate(orderDay(order().createdAt), {
							month: "short",
							day: "numeric",
							year: "numeric",
						})}{" "}
						· {formatPrice(order().total, order().currency)} · for{" "}
						{orderFor(order().details)}
						<Show when={order().delivery.hasPhoto}> · Photo available</Show>
					</p>
				</div>
				<div class="flex items-center gap-2">
					<button
						type="button"
						aria-expanded={expanded()}
						aria-controls={detailsId}
						onClick={() => setExpanded((open) => !open)}
						class="rounded-full px-3 py-2 text-sm text-petal-700 underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
					>
						{expanded() ? "Hide details" : "Details"}
					</button>
					<ReorderButton order={order()} />
				</div>
			</div>
			<Show when={expanded()}>
				<div id={detailsId} class="mt-4">
					<OrderTracker order={order()} showActions={false} />
				</div>
			</Show>
		</li>
	);
}

function NoOrders() {
	return (
		<div class="rounded-3xl bg-white px-6 py-12 text-center">
			<p class="font-display type-soft text-2xl font-semibold">No orders yet</p>
			<p class="mt-2 text-sm text-petal-900/65">
				Orders you place while signed in show up here so you can track them.
			</p>
			<Link to="/shop" class={`${pillPrimary} mt-5 w-auto px-6`}>
				Shop bouquets
			</Link>
		</div>
	);
}
