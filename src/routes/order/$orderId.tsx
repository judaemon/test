import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { FlowerMark, Petal, Sparkle } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { qrPaymentAccounts } from "~/data/payment-accounts";
import { formatDeliveryDate } from "~/lib/checkout";
import { CARD_BRAND_LABELS, type QrPaymentMethod } from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import { getOrder, type OrderPayment } from "~/server/orders";

export const Route = createFileRoute("/order/$orderId")({
	loader: async ({ params }) => {
		const order = await getOrder({ data: params.orderId });
		if (!order) throw notFound();
		return order;
	},
	head: () => ({ meta: [{ title: "Order confirmed · ORAIA" }] }),
	component: OrderConfirmation,
	notFoundComponent: OrderNotFound,
});

function OrderConfirmation() {
	const order = Route.useLoaderData();
	const details = () => order().details;
	const isPending = () => order().payment.status === "pending-verification";

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-12 sm:px-6">
				<div class="relative text-center">
					<Petal class="pointer-events-none absolute left-[12%] top-0 w-7 rotate-[-25deg] text-petal-200 motion-safe:animate-float-slow" />
					<Sparkle class="pointer-events-none absolute right-[14%] top-4 w-5 text-butter motion-safe:animate-float" />
					<span class="mx-auto flex size-20 items-center justify-center rounded-full bg-petal-100">
						<FlowerMark class="size-12" />
					</span>
					<h1 class="mt-6 font-display type-soft text-4xl font-semibold tracking-tight sm:text-5xl">
						Thank you!
					</h1>
					<p class="mx-auto mt-3 max-w-md text-lg text-petal-900/70">
						{isPending()
							? "We’ve got your order! Once we verify your payment, we’ll hand-tie"
							: "Your order is confirmed. We’ll hand-tie"}{" "}
						{order().itemCount === 1 ? "it" : "them"} fresh and deliver to{" "}
						<strong class="font-semibold text-petal-900">
							{details().recipientName}
						</strong>{" "}
						on{" "}
						<strong class="font-semibold text-petal-900">
							{formatDeliveryDate(details().deliveryDate)}
						</strong>
						.
					</p>
					<p class="mt-3 text-sm text-petal-900/60">
						Order <span class="font-mono font-medium">#{order().number}</span>
					</p>
				</div>

				<div class="mt-10 grid gap-5 sm:grid-cols-2">
					<section class="rounded-3xl border border-petal-100 bg-white p-6">
						<h2 class="font-display type-soft text-lg font-semibold">
							Delivering to
						</h2>
						<address class="mt-2 text-sm not-italic leading-relaxed text-petal-900/75">
							{details().recipientName}
							<br />
							{details().address}
							<br />
							{details().city} {details().postalCode}
						</address>
						<p class="mt-3 text-sm text-petal-900/75">
							Updates go to {details().email} and {details().phone}
						</p>
					</section>

					<section class="rounded-3xl bg-petal-100 p-6">
						<h2 class="font-display type-soft text-lg font-semibold">
							On the card
						</h2>
						<Show
							when={details().giftMessage}
							fallback={
								<p class="mt-2 text-sm text-petal-900/65">
									No note this time — the flowers will do the talking.
								</p>
							}
						>
							<blockquote class="mt-3 rotate-[-1deg] rounded-2xl bg-white px-5 py-4 font-display text-lg italic leading-snug shadow-sm">
								“{details().giftMessage}”
							</blockquote>
						</Show>
					</section>
				</div>

				<PaymentSummary payment={order().payment} />

				<section
					aria-labelledby="items-heading"
					class="mt-5 rounded-3xl border border-petal-100 bg-white p-6"
				>
					<h2
						id="items-heading"
						class="font-display type-soft text-lg font-semibold"
					>
						Your bouquets
					</h2>
					<ul class="mt-4 flex flex-col gap-4">
						<For each={order().lines}>
							{(line) => (
								<li class="flex items-center gap-4">
									<img
										src={line.image}
										alt=""
										width={64}
										height={64}
										class="size-16 rounded-2xl bg-petal-50 object-cover"
									/>
									<span class="min-w-0 flex-1">
										<span class="block font-medium">{line.title}</span>
										<span class="block text-sm text-petal-900/60">
											{line.colorName} · Qty {line.quantity}
										</span>
									</span>
									<span class="text-sm font-medium tabular-nums">
										{formatPrice(line.lineTotal, order().currency)}
									</span>
								</li>
							)}
						</For>
					</ul>
					<dl class="mt-5 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-petal-100 pt-4 text-sm">
						<dt class="text-petal-900/70">Subtotal</dt>
						<dd class="text-right tabular-nums">
							{formatPrice(order().subtotal, order().currency)}
						</dd>
						<dt class="text-petal-900/70">Delivery</dt>
						<dd class="text-right font-medium text-sage-600">Free</dd>
						<dt class="pt-2 text-base font-semibold">Total</dt>
						<dd class="pt-2 text-right text-base font-semibold tabular-nums">
							{formatPrice(order().total, order().currency)}
						</dd>
					</dl>
				</section>

				<div class="mt-10 flex justify-center">
					<Link to="/" class={`${pillPrimary} w-auto px-8`}>
						Back to the shop
					</Link>
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}

function OrderNotFound() {
	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
				<h1 class="font-display type-soft text-3xl font-semibold">
					We couldn’t find that order
				</h1>
				<p class="max-w-md text-petal-900/70">
					The link may be mistyped, or the order was placed before the shop last
					restarted.
				</p>
				<Link to="/" class={`${pillPrimary} w-auto px-8`}>
					Back to the shop
				</Link>
			</main>
		</div>
	);
}

function PaymentSummary(props: { payment: OrderPayment }) {
	const method = () => props.payment.method;
	const label = () =>
		method() === "card"
			? `${CARD_BRAND_LABELS[props.payment.cardBrand ?? "unknown"]} •••• ${props.payment.cardLast4}`
			: qrPaymentAccounts[method() as QrPaymentMethod].label;

	return (
		<section class="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-petal-100 bg-white p-6">
			<div>
				<h2 class="font-display type-soft text-lg font-semibold">Payment</h2>
				<p class="mt-1 text-sm text-petal-900/75">
					{label()}
					<Show when={props.payment.referenceNumber}>
						{(reference) => (
							<>
								{" "}
								· Ref <span class="font-mono">{reference()}</span>
							</>
						)}
					</Show>
				</p>
				<Show when={props.payment.status === "pending-verification"}>
					<p class="mt-1 text-sm text-petal-900/60">
						We’ve received your screenshot and will verify it shortly.
					</p>
				</Show>
			</div>
			<span
				class={
					props.payment.status === "paid"
						? "rounded-full bg-success px-3 py-1 text-sm font-medium text-success-foreground"
						: "rounded-full bg-warning px-3 py-1 text-sm font-medium text-warning-foreground"
				}
			>
				{props.payment.status === "paid" ? "Paid" : "Verifying payment"}
			</span>
		</section>
	);
}
