import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { For, onMount, Show } from "solid-js";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { CompanyLabel } from "~/components/order/company-label";
import { PaymentStatusPill } from "~/components/order/payment-status";
import { FlowerMark, Petal, Sparkle } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { CONTACT } from "~/lib/contact";
import { rememberOrder } from "~/lib/my-orders";
import { CARD_BRAND_LABELS, PAYMENT_METHOD_LABELS } from "~/lib/payment";
import { formatPrice, styleLabel } from "~/lib/product";
import { useSessionUser } from "~/lib/use-catalog";
import { getOrder } from "~/server/orders";
import { isPaymentDue, type OrderPayment } from "~/types/order";

export const Route = createFileRoute("/order/$orderId")({
	loader: async ({ params }) => {
		const order = await getOrder({ data: params.orderId });
		if (!order) throw notFound();
		return order;
	},
	head: () => ({ meta: [{ title: "Your order · ORAIA" }] }),
	component: OrderConfirmation,
	notFoundComponent: OrderNotFound,
});

function OrderConfirmation() {
	const order = Route.useLoaderData();
	const details = () => order().details;
	const isPending = () => order().payment.status === "pending";
	const isOnHold = () => order().payment.status === "on_hold";
	const paymentDue = () =>
		order().stage === "new" && isPaymentDue(order().payment.status);
	const user = useSessionUser();
	// This link proves the order is theirs; Check your order uses it to let them pay.
	onMount(() => rememberOrder(order().number, order().id));

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
						{isOnHold()
							? "Your order is confirmed! Once we receive and verify your payment, we’ll hand-tie"
							: isPending()
								? "We’ve got your order! Once we verify your payment, we’ll hand-tie"
								: "Your order is confirmed. We’ll hand-tie"}{" "}
						{order().itemCount === 1 ? "it" : "them"} fresh
						<Show when={details().dedicationFor}>
							{(name) => (
								<>
									{" "}
									for{" "}
									<strong class="font-semibold text-petal-900">{name()}</strong>
								</>
							)}
						</Show>
						.
					</p>
					<p class="mx-auto mt-5 inline-flex flex-col items-center rounded-2xl border border-petal-100 bg-white px-6 py-3">
						<span class="text-xs font-medium uppercase tracking-wide text-petal-900/55">
							Your order number
						</span>
						<span class="font-display type-soft text-3xl font-semibold tabular-nums">
							#{order().number}
						</span>
					</p>
				</div>

				<Show when={order().stage === "cancelled"}>
					<section class="mt-8 rounded-3xl border border-error-foreground/25 bg-error px-6 py-5 text-error-foreground">
						<h2 class="font-display type-soft text-xl font-semibold">
							This order is cancelled
						</h2>
						<Show when={order().cancelReason}>
							<p class="mt-1 text-sm">Reason: {order().cancelReason}</p>
						</Show>
						<p class="mt-2 text-sm">
							If you already paid, message us on{" "}
							<a
								href={CONTACT.facebookUrl}
								target="_blank"
								rel="noreferrer"
								class="font-medium underline"
							>
								Facebook
							</a>{" "}
							or call {CONTACT.phone} with your order number for a refund.
						</p>
					</section>
				</Show>

				<Show when={paymentDue()}>
					<section class="mt-8 rounded-3xl border border-warning-foreground/25 bg-warning px-6 py-5 text-warning-foreground">
						<h2 class="font-display type-soft text-xl font-semibold">
							{isOnHold()
								? "Your order is confirmed and on hold"
								: "We couldn’t match your payment"}
						</h2>
						<p class="mt-1 text-sm">
							{isOnHold()
								? "We’ll start on it once we receive your payment. Please send it as soon as you can, here or from Check your order."
								: "Check your reference number and send it again."}
						</p>
						<Link
							to="/pay/$orderNumber"
							params={{ orderNumber: order().number }}
							search={{ key: order().id }}
							class={`${pillPrimary} mt-4 w-auto px-8`}
						>
							Pay for this order
						</Link>
						<Show when={!user()}>
							<p class="mt-3 text-sm">
								Paying from another phone?{" "}
								<Link
									to="/sign-in"
									search={{
										redirect: `/pay/${order().number}?key=${order().id}`,
									}}
									class="font-medium underline underline-offset-2"
								>
									Sign in
								</Link>{" "}
								to keep this order on your account.
							</p>
						</Show>
					</section>
				</Show>

				<div class="mt-10 grid gap-5 sm:grid-cols-2">
					<section class="rounded-3xl border border-petal-100 bg-white p-6">
						<h2 class="font-display type-soft text-lg font-semibold">
							Ordered by
						</h2>
						<p class="mt-2 text-sm leading-relaxed text-petal-900/75">
							{details().fullName}
							<br />
							<CompanyLabel
								company={details().company}
								className={details().className}
							/>
						</p>
						<Show when={details().notes}>
							<p class="mt-3 whitespace-pre-line text-sm text-petal-900/75">
								<span class="font-medium text-petal-900">Notes:</span>{" "}
								{details().notes}
							</p>
						</Show>
					</section>

					<section class="rounded-3xl bg-petal-100 p-6">
						<h2 class="font-display type-soft text-lg font-semibold">
							On the card
						</h2>
						<Show
							when={details().addDedication}
							fallback={
								<p class="mt-2 text-sm text-petal-900/65">
									No dedication this time — the flowers will do the talking.
								</p>
							}
						>
							<div class="mt-3 rotate-[-1deg] rounded-2xl bg-white px-5 py-4 shadow-sm">
								<Show when={details().dedicationFor}>
									<p class="text-sm font-medium">
										To: {details().dedicationFor}
									</p>
								</Show>
								<blockquote class="mt-1 whitespace-pre-line font-display text-lg italic leading-snug">
									“{details().dedicationMessage}”
								</blockquote>
							</div>
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
											{styleLabel(line)} · Qty {line.quantity}
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
						<dt class="pt-2 text-base font-semibold">Total</dt>
						<dd class="pt-2 text-right text-base font-semibold tabular-nums">
							{formatPrice(order().total, order().currency)}
						</dd>
					</dl>
				</section>

				<div class="mt-10 flex flex-wrap justify-center gap-3">
					<Show when={order().ownedByViewer}>
						<Link
							to="/account/orders"
							class="inline-flex h-12 items-center justify-center rounded-full border border-petal-200 bg-white px-8 text-base font-medium text-petal-900 transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							Track this order
						</Link>
					</Show>
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
					The link may be mistyped. If you placed it while signed in, you’ll
					find it under Your account → Orders.
				</p>
				<Link to="/" class={`${pillPrimary} w-auto px-8`}>
					Back to the shop
				</Link>
			</main>
		</div>
	);
}

function PaymentSummary(props: { payment: OrderPayment }) {
	const label = () =>
		props.payment.method === "card"
			? `${CARD_BRAND_LABELS[props.payment.cardBrand ?? "unknown"]} •••• ${props.payment.cardLast4}`
			: PAYMENT_METHOD_LABELS[props.payment.method];

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
				<Show when={props.payment.status === "pending"}>
					<p class="mt-1 text-sm text-petal-900/60">
						We’ll check your reference number and verify the payment shortly.
					</p>
				</Show>
				<Show when={props.payment.status === "on_hold"}>
					<p class="mt-1 text-sm text-petal-900/60">
						We’re waiting for your reference number.
					</p>
				</Show>
				<Show when={props.payment.status === "rejected"}>
					<p class="mt-1 text-sm text-petal-900/60">
						We couldn’t match this payment. Send it again, or contact us with
						your order number.
					</p>
				</Show>
			</div>
			<PaymentStatusPill
				status={props.payment.status}
				class="px-3 py-1 text-sm"
			/>
		</section>
	);
}
