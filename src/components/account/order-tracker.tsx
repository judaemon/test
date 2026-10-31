import { Link } from "@tanstack/solid-router";
import { createMemo, For, Show } from "solid-js";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { CompanyLabel } from "~/components/order/company-label";
import { PaymentStatusPill } from "~/components/order/payment-status";
import { PrivateImage } from "~/components/order/private-image";
import { showToast } from "~/components/ui/toast";
import { setCartOpen } from "~/lib/cart-store";
import { orderDay } from "~/lib/checkout";
import { PAYMENT_METHOD_LABELS } from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import { reorderToCart } from "~/lib/reorder";
import { formatDate, SHOP_TIME_ZONE } from "~/lib/time";
import { useCatalog } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import { type CustomerOrder, isPaymentDue, TRACKER_STEPS } from "~/types/order";

const formatTime = (iso: string) =>
	new Date(iso).toLocaleString("en-PH", {
		timeZone: SHOP_TIME_ZONE,
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

/** Puts a past order back in the bag and opens it. */
export function ReorderButton(props: { order: CustomerOrder; class?: string }) {
	const catalog = useCatalog();
	const reorder = () => {
		const { added, unavailable } = reorderToCart(props.order.lines, catalog());
		if (added === 0) {
			showToast({
				variant: "error",
				title: "Those bouquets aren’t available right now",
				description: "Have a look at what’s fresh in the shop instead.",
				duration: 5000,
			});
			return;
		}
		if (unavailable.length > 0) {
			showToast({
				variant: "warning",
				title: "Added what we could",
				description: `Not available right now: ${unavailable.join(", ")}.`,
				duration: 5000,
			});
		}
		setCartOpen(true);
	};
	return (
		<button
			type="button"
			onClick={reorder}
			class={cn(pillPrimary, "h-10 w-auto px-5 text-sm", props.class)}
		>
			Re-order
		</button>
	);
}

/** Placed → Preparing → Delivered, with times and rider. */
export function OrderTracker(props: {
	order: CustomerOrder;
	/** Off when embedded somewhere that already offers Re-order. */
	showActions?: boolean;
}) {
	const order = () => props.order;
	const currentIndex = () =>
		TRACKER_STEPS.findIndex((step) => step.stage === order().stage);
	// Latest time each stage was reached (an order can move back and forth).
	const reachedAt = createMemo(() => {
		const times = new Map<string, string>();
		for (const event of order().events) times.set(event.stage, event.at);
		return times;
	});
	const awaitingPayment = () =>
		order().payment.status === "pending" || paymentDue();
	const paymentDue = () =>
		order().stage === "new" && isPaymentDue(order().payment.status);

	return (
		<article
			class="rounded-3xl border border-petal-100 bg-white p-5 sm:p-6"
			aria-labelledby={`order-${order().id}`}
		>
			<header class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3
						id={`order-${order().id}`}
						class="font-display type-soft text-xl font-semibold"
					>
						Order #{order().number}
					</h3>
					<p class="mt-0.5 text-sm text-petal-900/60">
						Placed {formatTime(order().createdAt)} ·{" "}
						{formatPrice(order().total, order().currency)}
					</p>
				</div>
				<Show when={awaitingPayment()}>
					<PaymentStatusPill status={order().payment.status} />
				</Show>
			</header>

			<Show
				when={order().stage !== "cancelled"}
				fallback={
					<p class="mt-4 rounded-2xl bg-petal-50 px-4 py-3 text-sm text-petal-900/75">
						This order was cancelled. If you already paid, we’ll refund you.
					</p>
				}
			>
				<ol class="mt-5 grid gap-3 sm:grid-cols-4 sm:gap-2">
					<For each={TRACKER_STEPS}>
						{(step, index) => {
							const done = () =>
								index() < currentIndex() || order().stage === "done";
							const current = () =>
								index() === currentIndex() && order().stage !== "done";
							return (
								<li
									aria-current={current() ? "step" : undefined}
									class="relative flex items-start gap-3 sm:flex-col sm:items-center sm:text-center"
								>
									{/* Connector to the next step. */}
									<Show when={index() < TRACKER_STEPS.length - 1}>
										<span
											aria-hidden="true"
											class={cn(
												"absolute left-[15px] top-8 h-[calc(100%-0.5rem)] w-0.5 sm:left-[calc(50%+18px)] sm:top-[15px] sm:h-0.5 sm:w-[calc(100%-36px)]",
												done() ? "bg-sage-600" : "bg-petal-100",
											)}
										/>
									</Show>
									<span
										aria-hidden="true"
										class={cn(
											"relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
											done() && "border-sage-600 bg-sage-600 text-white",
											current() &&
												"border-petal-700 bg-petal-700 text-white motion-safe:animate-pulse",
											!done() &&
												!current() &&
												"border-petal-200 bg-white text-petal-900/40",
										)}
									>
										{done() ? "✓" : index() + 1}
									</span>
									<span class="min-w-0 pb-1">
										<span
											class={cn(
												"block text-sm",
												current() || done()
													? "font-semibold"
													: "text-petal-900/55",
											)}
										>
											{step.label}
										</span>
										<Show
											when={
												(done() || current()) && reachedAt().get(step.stage)
											}
										>
											{(at) => (
												<span class="block text-xs text-petal-900/55">
													{formatTime(at())}
												</span>
											)}
										</Show>
										<Show
											when={
												step.stage === "new" && current() && awaitingPayment()
											}
										>
											<span class="block text-xs text-warning-foreground">
												{order().payment.status === "rejected"
													? "We couldn’t match your payment. Please send it again."
													: order().payment.status === "on_hold"
														? "Confirmed, and on hold until we receive your payment."
														: `Checking your ${PAYMENT_METHOD_LABELS[order().payment.method]} payment`}
											</span>
										</Show>
										<span class="sr-only">
											{done()
												? "(done)"
												: current()
													? "(current step)"
													: "(upcoming)"}
										</span>
									</span>
								</li>
							);
						}}
					</For>
				</ol>
			</Show>

			<div class="mt-5 grid gap-4 border-t border-petal-100 pt-5 sm:grid-cols-2">
				<div class="text-sm">
					<p class="font-medium">Ordered by</p>
					<p class="mt-1 text-petal-900/70">
						{order().details.fullName}
						<br />
						<CompanyLabel
							company={order().details.company}
							className={order().details.className}
						/>
					</p>
					<p class="mt-2 text-petal-900/70">
						Placed {formatDate(orderDay(order().createdAt))}
						<Show when={order().details.dedicationFor}>
							{(name) => <> · for {name()}</>}
						</Show>
					</p>
				</div>
				<Show when={order().delivery.riderName && order().stage === "done"}>
					<div class="rounded-2xl bg-sage-100 px-4 py-3 text-sm text-sage-600">
						<p class="font-medium">Your rider</p>
						<p class="mt-1 text-petal-900">{order().delivery.riderName}</p>
						<Show when={order().delivery.riderPhone}>
							{(phone) => (
								<a
									href={`tel:${phone().replace(/[^\d+]/g, "")}`}
									class="mt-1 inline-block font-medium underline underline-offset-2"
								>
									Call {phone()}
								</a>
							)}
						</Show>
					</div>
				</Show>
			</div>

			<Show when={order().delivery.hasPhoto}>
				<figure class="mt-5">
					<figcaption class="mb-2 text-sm font-medium">
						Proof of delivery
					</figcaption>
					<div class="overflow-hidden rounded-2xl border border-petal-100 bg-petal-50">
						<PrivateImage
							url={`/api/orders/${order().id}/delivery-photo`}
							alt={`Your bouquet delivered for order ${order().number}`}
							class="max-h-80 w-full object-contain"
						/>
					</div>
				</figure>
			</Show>

			<ul class="mt-5 flex flex-wrap gap-3">
				<For each={order().lines}>
					{(line) => (
						<li class="flex items-center gap-2 rounded-2xl bg-petal-50 py-1.5 pl-1.5 pr-3 text-sm">
							<img
								src={line.image}
								alt=""
								class="size-10 rounded-xl object-cover"
							/>
							<span>
								{line.quantity} × {line.colorName}
								<span class="block text-xs text-petal-900/55">
									{line.title}
								</span>
							</span>
						</li>
					)}
				</For>
			</ul>

			<Show when={props.showActions ?? true}>
				<div class="mt-5 flex flex-wrap items-center gap-3">
					<Show when={paymentDue()}>
						<Link
							to="/pay/$orderNumber"
							params={{ orderNumber: order().number }}
							search={{ key: order().id }}
							class={cn(pillPrimary, "h-10 w-auto px-5 text-sm")}
						>
							Pay now
						</Link>
					</Show>
					<ReorderButton order={order()} />
					<Link
						to="/order/$orderId"
						params={{ orderId: order().id }}
						class="rounded-full px-3 py-2 text-sm text-petal-700 underline-offset-2 hover:underline"
					>
						View receipt
					</Link>
				</div>
			</Show>
		</article>
	);
}
