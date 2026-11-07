import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { For, Show } from "solid-js";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { PaymentNotice } from "~/components/checkout/payment-notice";
import { CompanyLabel } from "~/components/order/company-label";
import { PaymentStatusPill } from "~/components/order/payment-status";
import { PreorderTag } from "~/components/product/preorder-tag";
import {
	LinePrice,
	SaleRows,
	subtotalBeforeSale,
} from "~/components/shop/sale-price";
import { FlowerMark, Petal, Sparkle } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import { hasCard, hasContent, orderCards } from "~/lib/bouquet-messages";
import { CONTACT } from "~/lib/contact";
import {
	formatEditDeadline,
	ORDER_EDIT_LOCKED,
	ORDER_EDIT_RULE,
	orderEditState,
} from "~/lib/order-edit";
import {
	CARD_BRAND_LABELS,
	CASH_NOTICE,
	PAYMENT_METHOD_LABELS,
} from "~/lib/payment";
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
	const editState = () => orderEditState(order());
	const cancelled = () => order().stage === "cancelled";
	/** Everyone the cards are addressed to. */
	const recipients = () => [
		...new Set(
			orderCards(order())
				.map((card) => card.to)
				.filter(Boolean),
		),
	];

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
						{cancelled() ? "Order cancelled" : "Thank you!"}
					</h1>
					<Show when={!cancelled()}>
						<p class="mx-auto mt-3 max-w-md text-lg text-petal-900/70">
							{isOnHold()
								? "Your order is confirmed! Once we receive and verify your payment, we’ll hand-tie"
								: isPending()
									? "We’ve got your order! Once we verify your payment, we’ll hand-tie"
									: "Your order is confirmed. We’ll hand-tie"}{" "}
							{order().itemCount === 1 ? "it" : "them"} fresh
							<Show when={recipients().length > 0}>
								{" "}
								for{" "}
								<For each={recipients()}>
									{(name, index) => (
										<>
											{index() === 0
												? ""
												: index() === recipients().length - 1
													? " and "
													: ", "}
											<strong class="font-semibold text-petal-900">
												{name}
											</strong>
										</>
									)}
								</For>
							</Show>
							.
						</p>
					</Show>
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
								? order().payment.method === "cash"
									? `${CASH_NOTICE} We’ll start on it once it’s received, or you can pay online instead.`
									: "We’ll start on it once we receive your payment. Please send it as soon as you can, here or from Check your order, and don’t forget your reference number: it’s how we verify your payment."
								: "Check your reference number and send it again."}
						</p>
						<Show when={order().payment.notice}>
							{(notice) => (
								<PaymentNotice text={notice()} class="mt-3 bg-white" />
							)}
						</Show>
						<Link
							to="/pay/$orderNumber"
							params={{ orderNumber: order().number }}
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
										redirect: `/pay/${order().number}`,
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

				<Show when={order().cancelledBouquets.length > 0}>
					<section class="mt-8 rounded-3xl border border-error-foreground/25 bg-error px-6 py-5 text-error-foreground">
						<h2 class="font-display type-soft text-xl font-semibold">
							{order().cancelledBouquets.length === 1
								? "A bouquet was cancelled from this order"
								: "Some bouquets were cancelled from this order"}
						</h2>
						<ul class="mt-2 flex flex-col gap-1 text-sm wrap-anywhere">
							<For each={order().cancelledBouquets}>
								{(bouquet) => (
									<li>
										<span class="font-medium">{bouquet.name}</span>. Reason:{" "}
										{bouquet.reason}
									</li>
								)}
							</For>
						</ul>
						<p class="mt-2 text-sm">
							The rest of your order is still on, and your total has been
							updated.
						</p>
					</section>
				</Show>

				<Show
					when={editState().editable}
					fallback={
						<Show when={order().stage === "new" || order().stage === "making"}>
							<p class="mt-8 rounded-2xl bg-petal-50 px-4 py-3 text-sm">
								{ORDER_EDIT_LOCKED[editState().lock ?? "progress"]} Need a
								change? Message us with your order number.
							</p>
						</Show>
					}
				>
					<section class="mt-8 rounded-3xl border border-petal-100 bg-white px-6 py-5">
						<h2 class="font-display type-soft text-xl font-semibold">
							Need to change something?
						</h2>
						<p class="mt-1 text-sm text-petal-900/75">
							{ORDER_EDIT_RULE} You have until{" "}
							<strong class="font-semibold">
								{formatEditDeadline(editState().until)}
							</strong>
							.
						</p>
						<p class="mt-1 text-sm text-petal-900/75">
							Tap Edit order to change your bouquets, how many you want, your
							details, or your cards and notes.
							<Show when={!order().ownedByViewer}>
								{" "}
								You’ll confirm the email you used when you ordered, to make sure
								it’s you.
							</Show>{" "}
							You can also get here from Check your order. Once you send your
							payment, the order is locked.
						</p>
						<Link
							to="/order/$orderId/edit"
							params={{ orderId: order().id }}
							class="mt-4 inline-flex h-11 items-center justify-center rounded-full border border-petal-200 bg-white px-6 text-sm font-medium outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							Edit order
						</Link>
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
							// Older orders have one card for the whole order.
							when={details().addDedication}
							fallback={
								<p class="mt-2 text-sm text-petal-900/65">
									{orderCards(order()).length === 0
										? "No dedication this time — the flowers will do the talking."
										: orderCards(order()).length === 1
											? "Your card is shown with its bouquet below."
											: `Your ${orderCards(order()).length} cards are shown with their bouquets below.`}
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
								<li class="flex flex-wrap items-center gap-x-4 gap-y-3">
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
										<Show when={line.preorder}>
											<PreorderTag readyBy={line.readyBy} class="mt-1" />
										</Show>
									</span>
									<span class="text-sm font-medium tabular-nums">
										<LinePrice line={line} currency={order().currency} />
									</span>
									<Show when={line.messages?.some(hasContent)}>
										<div class="flex w-full flex-col gap-2 wrap-anywhere sm:pl-20">
											<For each={line.messages}>
												{(message, unit) => (
													<Show when={hasContent(message)}>
														<span class="block rounded-2xl bg-petal-50 px-4 py-3 text-sm">
															<Show when={line.quantity > 1}>
																<span class="block text-xs font-semibold text-petal-900/60">
																	Bouquet {unit() + 1} of {line.quantity}
																</span>
															</Show>
															<Show
																when={hasCard(message)}
																fallback={
																	<span class="block text-petal-900/60">
																		No card
																	</span>
																}
															>
																<Show when={message.to}>
																	<span class="block font-medium">
																		To: {message.to}
																	</span>
																</Show>
																<span class="block whitespace-pre-line font-display text-base italic leading-snug">
																	“{message.message}”
																</span>
															</Show>
															<Show when={message.note}>
																<span class="mt-1 block whitespace-pre-line text-petal-900/75">
																	<span class="font-medium text-petal-900">
																		Note:
																	</span>{" "}
																	{message.note}
																</span>
															</Show>
														</span>
													</Show>
												)}
											</For>
										</div>
									</Show>
								</li>
							)}
						</For>
					</ul>
					<dl class="mt-5 grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-petal-100 pt-4 text-sm">
						<dt class="text-petal-900/70">Subtotal</dt>
						<dd class="text-right tabular-nums">
							{formatPrice(subtotalBeforeSale(order()), order().currency)}
						</dd>
						<SaleRows lines={order().lines} currency={order().currency} />
						<Show when={order().promo}>
							{(promo) => (
								<>
									<dt class="text-sale">{promo().name}</dt>
									<dd class="text-right font-medium tabular-nums text-sale">
										−{formatPrice(promo().amount, order().currency)}
									</dd>
								</>
							)}
						</Show>
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
						{props.payment.method === "cash"
							? "We’re waiting for your cash payment."
							: "We’re waiting for your reference number."}
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
