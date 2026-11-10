import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import {
	createEffect,
	createResource,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";
import { CancelOrderButton } from "~/components/admin/cancel-order";
import { ChangePaymentMethodButton } from "~/components/admin/change-payment-method";
import { useLeaveForm } from "~/components/admin/leave-form";
import { OrderLogTable } from "~/components/admin/order-log-table";
import { OrderNotes } from "~/components/admin/order-notes";
import { ReferenceNumberEditor } from "~/components/admin/reference-number";
import {
	adminButton,
	adminCard,
	adminInput,
	Field,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { PaymentNotice } from "~/components/checkout/payment-notice";
import { CompanyLabel } from "~/components/order/company-label";
import { PaymentStatusPill } from "~/components/order/payment-status";
import { printDedicationCard } from "~/components/order/print-card";
import { PrivateImage } from "~/components/order/private-image";
import {
	LinePrice,
	SaleRows,
	subtotalBeforeSale,
} from "~/components/shop/sale-price";
import { ZoomableImage } from "~/components/zoom/zoomable-image";
import { hasCard, orderCards, orderMessages } from "~/lib/bouquet-messages";
import { isChatOrder } from "~/lib/chat-order";
import { formatDeliveryDate, formatSerialNumber } from "~/lib/checkout";
import { cashTotal, formatBills } from "~/lib/custom-bouquet";
import { formatRecipeItem, stemCount } from "~/lib/flowers";
import { canCancelOneBouquet, ORDER_EDIT_HOURS } from "~/lib/order-edit";
import { CARD_BRAND_LABELS, PAYMENT_METHOD_LABELS } from "~/lib/payment";
import { formatPrice, preorderNote, wrapperNames } from "~/lib/product";
import { useFlowerPhotos } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import {
	assignRider,
	getAdminOrder,
	listOrderLogFn,
	markOrderTest,
	moveOrder,
	type OrderActionResult,
	reviewOrderPayment,
	uploadDeliveryPhoto,
} from "~/server/admin/orders";
import {
	BOARD_STAGES,
	type BoardStage,
	canStartMaking,
	isPaymentSettled,
	type Order,
	STAGE_LABELS,
} from "~/types/order";

/** Rider details and proof of delivery are switched off for now; set to true to bring them back. */
const SHOW_DELIVERY = false;

/** Proof URLs leave off the extension (see `publicUploadUrl`). */
const proofId = (fileName: string) => fileName.replace(/\.(png|jpg|webp)$/, "");

export const Route = createFileRoute("/admin/_dashboard/orders/$orderId")({
	// Stepped back to after editing, wait for the fresh order rather than
	// showing the old one first and swapping it in.
	loader: {
		handler: async ({ params }) => {
			const order = await getAdminOrder({ data: params.orderId });
			if (!order) throw notFound();
			return order;
		},
		staleReloadMode: "blocking",
	},
	component: OrderDetail,
	notFoundComponent: () => (
		<div class="py-20 text-center">
			<p class="font-display type-soft text-2xl">Order not found</p>
			<Link to="/admin/orders" class={cn(adminButton.secondary, "mt-4")}>
				Back to orders
			</Link>
		</div>
	),
});

function OrderDetail() {
	const loaded = Route.useLoaderData();
	const context = Route.useRouteContext();
	const staff = () => context().user;
	// Back to the list as it was (filters and scroll).
	const { stepBack } = useLeaveForm({
		routeId: Route.id,
		fallback: { to: "/admin/orders" },
	});
	const [order, setOrder] = createSignal<Order>(loaded());
	createEffect(on(loaded, (fresh) => setOrder(fresh), { defer: true }));
	const [busy, setBusy] = createSignal(false);

	const details = () => order().details;
	const flowerPhoto = useFlowerPhotos();
	const payment = () => order().payment;
	const cancelled = () => order().stage === "cancelled";

	const run = async (
		action: () => Promise<OrderActionResult>,
		success: string,
	) => {
		setBusy(true);
		try {
			const result = await action();
			if (result.ok) {
				setOrder(result.order);
				toastSuccess(success);
			} else toastError(new Error(result.message));
		} catch (error) {
			toastError(error);
		} finally {
			setBusy(false);
		}
	};

	const moveTo = (stage: BoardStage) =>
		run(
			() => moveOrder({ data: { id: order().id, stage } }),
			`Moved to ${STAGE_LABELS[stage]}.`,
		);
	const markTest = (isTest: boolean) =>
		run(
			() => markOrderTest({ data: { id: order().id, isTest } }),
			isTest
				? "Marked as a test. It won’t count in reports."
				: "Now a real order again.",
		);
	const review = (decision: "verified" | "rejected") =>
		run(
			() => reviewOrderPayment({ data: { id: order().id, status: decision } }),
			decision === "verified"
				? "Payment verified."
				: "Payment marked as rejected.",
		);

	return (
		<div>
			<Link
				to="/admin/orders"
				onClick={stepBack}
				class={cn(adminButton.ghost, "-ml-2 mb-2")}
			>
				← Back
			</Link>
			<PageHeader
				title={`Order #${order().number}`}
				description={`Placed ${new Date(order().createdAt).toLocaleString(
					"en-PH",
					{
						timeZone: "Asia/Manila",
						dateStyle: "medium",
						timeStyle: "short",
					},
				)}`}
			/>

			<Show when={order().isTest}>
				<p class="mb-5 rounded-2xl border border-petal-200 bg-petal-50 px-4 py-3 text-sm">
					<strong class="font-semibold">Test order.</strong> It’s left out of
					reports and holds no stock. Customers can still find it in Check your
					order.
				</p>
			</Show>

			<Show when={order().customerEditedAt}>
				{(at) => (
					<p class="mb-5 rounded-2xl border border-petal-200 bg-petal-50 px-4 py-3 text-sm">
						<strong class="font-semibold">Edited by the customer</strong> on{" "}
						{new Date(at()).toLocaleString("en-PH", {
							timeZone: "Asia/Manila",
							dateStyle: "medium",
							timeStyle: "short",
						})}
						. Check its bouquets and total, and reprint any card you printed
						before then.
					</p>
				)}
			</Show>

			<Show when={order().cancelReason}>
				<div class="mb-5 rounded-2xl border border-error-foreground/25 bg-error px-4 py-3 text-sm text-error-foreground">
					<p class="whitespace-pre-line wrap-anywhere">
						<strong class="font-semibold">
							Cancelled by {order().cancelledBy ?? "the customer"}.
						</strong>{" "}
						Reason: {order().cancelReason}
					</p>
					<Show when={order().cancelProof}>
						{(file) => (
							<a
								href={`/api/admin/cancel-proofs/${proofId(file())}`}
								target="_blank"
								rel="noreferrer"
								class="mt-3 block max-w-sm overflow-hidden rounded-xl border border-petal-100 bg-white"
							>
								<PrivateImage
									url={`/api/admin/cancel-proofs/${proofId(file())}`}
									alt={`Proof for cancelling order ${order().number}`}
									class="max-h-72 w-full object-contain"
								/>
								<span class="block px-3 py-2 text-center text-xs text-petal-700">
									Open full size
								</span>
							</a>
						)}
					</Show>
				</div>
			</Show>

			<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
				<div class="flex flex-col gap-5">
					<OrderNotes orderId={order().id} user={staff()} />
					<Show when={order().cancelledBouquets.length > 0}>
						<section class={cn(adminCard, "p-5")}>
							<h2 class="mb-3 font-semibold">Cancelled bouquets</h2>
							<ul class="flex flex-col gap-3 text-sm">
								<For each={order().cancelledBouquets}>
									{(bouquet) => (
										<li class="wrap-anywhere">
											<p class="font-medium">
												{bouquet.name} ·{" "}
												{formatPrice(bouquet.price, order().currency)}
											</p>
											<p class="whitespace-pre-line text-error-foreground">
												Reason: {bouquet.reason}
											</p>
											<p class="text-xs text-petal-900/55">
												By {bouquet.cancelledBy} ·{" "}
												{new Date(bouquet.at).toLocaleString("en-PH", {
													timeZone: "Asia/Manila",
													dateStyle: "medium",
													timeStyle: "short",
												})}
											</p>
											<Show when={bouquet.proofFile}>
												{(file) => (
													<a
														href={`/api/admin/cancel-proofs/${proofId(file())}`}
														target="_blank"
														rel="noreferrer"
														class="mt-2 block max-w-xs overflow-hidden rounded-xl border border-petal-100 bg-petal-50"
													>
														<PrivateImage
															url={`/api/admin/cancel-proofs/${proofId(file())}`}
															alt={`Proof for cancelling ${bouquet.name}`}
															class="max-h-60 w-full object-contain"
														/>
													</a>
												)}
											</Show>
										</li>
									)}
								</For>
							</ul>
						</section>
					</Show>

					<section class={cn(adminCard, "p-5")}>
						<h2 class="mb-3 font-semibold">Bouquets</h2>
						<Show
							when={
								!cancelled() &&
								order().stage !== "done" &&
								order().itemCount > 1 &&
								!canCancelOneBouquet(order())
							}
						>
							<p class="mb-3 rounded-xl bg-petal-50 px-3 py-2 text-sm">
								A single bouquet can only be cancelled within {ORDER_EDIT_HOURS}{" "}
								hours and before payment is sent, so here you can only cancel
								the whole order.
							</p>
						</Show>
						<ul class="flex flex-col gap-3">
							<For each={order().lines}>
								{(line) => (
									<li class="flex items-start gap-3">
										<ZoomableImage
											src={line.image ?? ""}
											alt={`${line.title}, ${line.colorName}`}
											caption={line.sku}
											hoverPreview
											class="size-24 rounded-xl bg-petal-50 object-cover"
										/>
										<span class="min-w-0 flex-1">
											<span class="block font-medium">
												{line.quantity} × {line.colorName}
												<Show when={line.preorder}>
													<span class="ml-2 rounded-full bg-warning px-2 py-0.5 text-xs font-medium text-warning-foreground">
														{preorderNote(line)}
													</span>
												</Show>
											</span>
											<span class="block text-xs text-petal-900/55">
												{line.title === line.sku
													? line.title
													: `${line.title} · ${line.sku}`}
											</span>
											<Show when={canCancelOneBouquet(order())}>
												<CancelOrderButton
													order={order()}
													line={line}
													class="mt-1 py-1 text-sm font-medium text-destructive underline underline-offset-2 hover:opacity-80"
													onCancelled={setOrder}
												>
													Cancel this bouquet
												</CancelOrderButton>
											</Show>
											<Show when={line.recipe?.length}>
												<Show when={stemCount(line.recipe)}>
													{(count) => (
														<span class="mt-2 block text-sm font-medium">
															{count()} flowers
														</span>
													)}
												</Show>
												<span class="mt-1 flex flex-wrap gap-2">
													<For each={line.recipe}>
														{(item) => (
															<span class="flex items-center gap-1.5 rounded-lg border border-petal-100 bg-white py-1 pl-1 pr-2.5 text-sm">
																<Show
																	when={flowerPhoto(item.flower, item.color)}
																	fallback={<span class="w-1" />}
																>
																	{(src) => (
																		<ZoomableImage
																			src={src()}
																			alt={item.flower}
																			caption={item.flower}
																			hoverPreview
																			class="size-9 rounded-md object-cover"
																		/>
																	)}
																</Show>
																{formatRecipeItem(item)}
															</span>
														)}
													</For>
												</span>
											</Show>
											<Show when={line.custom?.bills?.length}>
												<span class="mt-1 block text-sm">
													<span class="font-medium">
														Cash{" "}
														{formatPrice(
															cashTotal(line.custom?.bills),
															order().currency,
														)}
														:
													</span>{" "}
													{formatBills(line.custom?.bills)}
												</span>
											</Show>
											<Show when={line.custom?.referenceImages?.length}>
												<span class="mt-2 block text-sm font-medium">
													Look they want
												</span>
												<span class="mt-1 flex flex-wrap gap-2">
													<For each={line.custom?.referenceImages}>
														{(url, index) => (
															<ZoomableImage
																src={url}
																alt={`Reference photo ${index() + 1}`}
																caption={`#${order().number} · reference ${index() + 1}`}
																hoverPreview
																class="size-20 rounded-lg border border-black/10 object-cover"
															/>
														)}
													</For>
												</span>
											</Show>
											<Show when={line.sizeName}>
												<span class="block text-sm">
													<span class="font-medium">Size:</span> {line.sizeName}
												</span>
											</Show>
											<Show when={line.wrapperColor}>
												<span class="block text-sm">
													<span class="font-medium">
														{wrapperNames(line.wrapperColor).length > 1
															? "Wrappers:"
															: "Wrapper:"}
													</span>{" "}
													{line.wrapperColor}
												</span>
											</Show>
										</span>
										<span class="text-sm tabular-nums">
											<LinePrice line={line} currency={order().currency} />
										</span>
									</li>
								)}
							</For>
						</ul>
						<dl class="mt-4 grid grid-cols-[1fr_auto] gap-y-1 border-t border-petal-100 pt-3 text-sm">
							<Show when={order().lines.some((line) => line.sale)}>
								<dt class="text-petal-900/65">Before sale</dt>
								<dd class="text-right tabular-nums">
									{formatPrice(subtotalBeforeSale(order()), order().currency)}
								</dd>
								<SaleRows lines={order().lines} currency={order().currency} />
							</Show>
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
							<Show when={SHOW_DELIVERY}>
								<dt class="text-petal-900/65">Delivery</dt>
								<dd class="text-right">Free</dd>
							</Show>
							<dt class="font-semibold">Total</dt>
							<dd class="text-right font-semibold tabular-nums">
								{formatPrice(order().total, order().currency)}
							</dd>
						</dl>
					</section>

					<section class={cn(adminCard, "p-5")}>
						<h2 class="mb-2 font-semibold">Customer</h2>
						<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
							<dt class="text-petal-900/60">Name</dt>
							<dd class="font-medium">{details().fullName}</dd>
							<dt class="text-petal-900/60">Company</dt>
							<dd>
								<Show when={details().company} fallback="—">
									<CompanyLabel company={details().company} className="" />
								</Show>
							</dd>
							<dt class="text-petal-900/60">Class</dt>
							<dd>{details().className || "—"}</dd>
							<Show when={details().deliveryDate}>
								{(date) => (
									<>
										<dt class="text-petal-900/60">Delivery date</dt>
										<dd class="font-medium">{formatDeliveryDate(date())}</dd>
									</>
								)}
							</Show>
							<Show when={details().serialNumber}>
								<dt class="text-petal-900/60">Serial number</dt>
								<dd class="tabular-nums">
									{formatSerialNumber(details().serialNumber)}
								</dd>
							</Show>
							<Show when={details().email}>
								<dt class="text-petal-900/60">Email</dt>
								<dd class="min-w-0 break-words">
									<a
										href={`mailto:${details().email}`}
										class="underline-offset-2 hover:underline"
									>
										{details().email}
									</a>
								</dd>
							</Show>
						</dl>
						<Show when={details().notes}>
							<h3 class="mt-4 mb-1 text-sm font-semibold">Notes</h3>
							<p class="whitespace-pre-line text-sm">{details().notes}</p>
						</Show>
					</section>

					<section class={cn(adminCard, "p-5")}>
						<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
							<h2 class="font-semibold">Cards &amp; notes</h2>
							<Show when={orderCards(order()).length > 1}>
								<button
									type="button"
									onClick={() => printDedicationCard(order().id)}
									class="rounded-full border border-petal-200 px-3 py-1.5 text-sm font-medium text-petal-700 transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									🖨 Print all {orderCards(order()).length} cards
								</button>
							</Show>
						</div>
						<Show
							when={orderMessages(order()).some(
								// The order-wide note is shown with the customer above.
								(entry) => hasCard(entry) || entry.lineIndex !== undefined,
							)}
							fallback={
								<p class="text-sm text-petal-900/55">No dedication message.</p>
							}
						>
							<ul class="flex flex-col gap-3">
								<For each={orderMessages(order())}>
									{(entry) => {
										const cardIndex = () =>
											orderCards(order()).findIndex(
												(card) =>
													card.lineIndex === entry.lineIndex &&
													card.unit === entry.unit,
											);
										return (
											<Show
												when={hasCard(entry) || entry.lineIndex !== undefined}
											>
												<li class="flex min-w-0 flex-col gap-1.5 wrap-anywhere">
													<Show when={entry.label}>
														<p class="text-sm font-semibold">{entry.label}</p>
													</Show>
													<Show
														when={hasCard(entry)}
														fallback={
															<p class="text-sm text-petal-900/55">No card.</p>
														}
													>
														<button
															type="button"
															onClick={() =>
																printDedicationCard(order().id, cardIndex())
															}
															title="Print this dedication card (A5)"
															class="block w-full rounded-xl bg-petal-50 px-4 py-3 text-left transition-colors outline-none hover:bg-petal-100 focus-visible:ring-2 focus-visible:ring-petal-500"
														>
															<Show when={entry.to}>
																<span class="block text-sm font-medium">
																	To: {entry.to}
																</span>
															</Show>
															<span class="mt-1 block whitespace-pre-line font-display text-lg italic">
																“{entry.message}”
															</span>
															<span class="mt-2 block text-sm font-medium text-petal-700">
																🖨 Click to print the card (A5)
															</span>
														</button>
													</Show>
													<Show
														when={entry.lineIndex !== undefined && entry.note}
													>
														<p class="whitespace-pre-line text-sm">
															<span class="font-semibold">Note:</span>{" "}
															{entry.note}
														</p>
													</Show>
												</li>
											</Show>
										);
									}}
								</For>
							</ul>
						</Show>
					</section>
					<OrderActivity order={order()} />
				</div>

				<aside class="flex flex-col gap-5 lg:sticky lg:top-6">
					<section class={cn(adminCard, "p-5")}>
						<h2 class="mb-3 font-semibold">Stage</h2>
						<Show
							when={!cancelled()}
							fallback={
								<p class="text-sm text-petal-900/65">
									This order was cancelled and its bouquets went back into
									stock.
								</p>
							}
						>
							<fieldset class="flex flex-wrap gap-2">
								<legend class="sr-only">Move to stage</legend>
								<For each={BOARD_STAGES}>
									{(stage) => (
										<button
											type="button"
											disabled={busy() || order().stage === stage}
											aria-pressed={order().stage === stage}
											onClick={() => moveTo(stage)}
											class={cn(
												"rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:cursor-default",
												order().stage === stage
													? "border-petal-700 bg-petal-700 font-medium text-white"
													: "border-petal-200 bg-white hover:bg-petal-50",
											)}
										>
											{STAGE_LABELS[stage]}
										</button>
									)}
								</For>
							</fieldset>
							<Show when={!canStartMaking(payment())}>
								<p class="mt-3 text-sm text-warning-foreground">
									Verify the payment before moving this order past “New orders”.
								</p>
							</Show>
						</Show>
					</section>

					<section class={cn(adminCard, "p-5")}>
						<div class="mb-3 flex items-center justify-between gap-2">
							<h2 class="font-semibold">Payment</h2>
							<PaymentStatusPill status={payment().status} />
						</div>
						<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
							<dt class="text-petal-900/60">Method</dt>
							<dd>
								{payment().method === "card"
									? `${CARD_BRAND_LABELS[payment().cardBrand ?? "unknown"]} •••• ${payment().cardLast4}`
									: PAYMENT_METHOD_LABELS[payment().method]}
							</dd>
							<Show when={payment().referenceNumber}>
								<dt class="text-petal-900/60">Ref no.</dt>
								<dd class="font-mono">{payment().referenceNumber}</dd>
							</Show>
							<dt class="text-petal-900/60">Amount</dt>
							<dd class="font-medium tabular-nums">
								{formatPrice(order().total, order().currency)}
							</dd>
							{/* Orders added from a chat can be part-paid. */}
							<Show when={payment().amountPaid}>
								{(paid) => (
									<>
										<dt class="text-petal-900/60">Paid so far</dt>
										<dd class="tabular-nums">
											{formatPrice(paid(), order().currency)}
										</dd>
										<Show
											when={
												order().total - paid() > 0 &&
												!isPaymentSettled(payment().status)
											}
										>
											<dt class="text-petal-900/60">Still to pay</dt>
											<dd class="font-medium tabular-nums text-error-foreground">
												{formatPrice(order().total - paid(), order().currency)}
											</dd>
										</Show>
									</>
								)}
							</Show>
							<Show when={payment().reviewedBy}>
								<dt class="text-petal-900/60">Checked by</dt>
								<dd>{payment().reviewedBy}</dd>
							</Show>
						</dl>
						<Show when={payment().notice}>
							{(notice) => (
								<div class="mt-3">
									<p class="mb-1 text-xs text-petal-900/60">
										Warning the customer saw
									</p>
									<PaymentNotice text={notice()} class="px-3 py-2 text-xs" />
								</div>
							)}
						</Show>
						<Show when={payment().proofFile}>
							{(file) => (
								<a
									href={`/api/admin/proofs/${proofId(file())}`}
									target="_blank"
									rel="noreferrer"
									class="mt-4 block overflow-hidden rounded-xl border border-petal-100 bg-petal-50"
								>
									<PrivateImage
										url={`/api/admin/proofs/${proofId(file())}`}
										alt={`Payment screenshot for order ${order().number}`}
										class="max-h-96 w-full object-contain"
									/>
									<span class="block px-3 py-2 text-center text-xs text-petal-700">
										Open full size
									</span>
								</a>
							)}
						</Show>
						<Show when={order().paymentMethodChanges.length > 0}>
							<div class="mt-4 border-t border-petal-100 pt-3">
								<h3 class="mb-2 text-sm font-semibold">Method changes</h3>
								<ul class="flex flex-col gap-3 text-sm">
									<For each={order().paymentMethodChanges}>
										{(change) => (
											<li class="wrap-anywhere">
												<p class="font-medium">
													{PAYMENT_METHOD_LABELS[change.from]} →{" "}
													{PAYMENT_METHOD_LABELS[change.to]}
												</p>
												<p class="whitespace-pre-line">
													Reason: {change.reason}
												</p>
												<p class="text-xs text-petal-900/55">
													By {change.changedBy} ·{" "}
													{new Date(change.at).toLocaleString("en-PH", {
														timeZone: "Asia/Manila",
														dateStyle: "medium",
														timeStyle: "short",
													})}
												</p>
												<Show when={change.proofFile}>
													{(file) => (
														<a
															href={`/api/admin/proofs/${proofId(file())}`}
															target="_blank"
															rel="noreferrer"
															class="mt-2 block overflow-hidden rounded-xl border border-petal-100 bg-petal-50"
														>
															<PrivateImage
																url={`/api/admin/proofs/${proofId(file())}`}
																alt={`Proof for changing the payment method of order ${order().number}`}
																class="max-h-60 w-full object-contain"
															/>
														</a>
													)}
												</Show>
											</li>
										)}
									</For>
								</ul>
							</div>
						</Show>
						<Show when={payment().method !== "card" && !cancelled()}>
							<ReferenceNumberEditor
								order={order()}
								disabled={busy()}
								onSaved={setOrder}
							/>
							<ChangePaymentMethodButton
								order={order()}
								class={cn(adminButton.secondary, "mt-2 w-full")}
								disabled={busy()}
								onChanged={setOrder}
							>
								Change payment method
							</ChangePaymentMethodButton>
							<p class="mt-3 text-xs text-petal-900/60">
								{payment().method === "cash"
									? "Verify once 1st Class RICARDE (Foxtrot) has the cash in hand."
									: `Check that the amount and reference number match your ${PAYMENT_METHOD_LABELS[payment().method]} history.`}
							</p>
							<div class="mt-3 flex gap-2">
								<button
									type="button"
									class={cn(adminButton.primary, "flex-1")}
									disabled={busy() || payment().status === "verified"}
									onClick={() => review("verified")}
								>
									{payment().status === "verified"
										? "Verified"
										: "Verify payment"}
								</button>
								<button
									type="button"
									class={adminButton.danger}
									disabled={
										busy() ||
										payment().status === "rejected" ||
										payment().status === "on_hold" ||
										order().stage !== "new"
									}
									onClick={() => review("rejected")}
								>
									Reject
								</button>
							</div>
						</Show>
					</section>

					<Show when={SHOW_DELIVERY && !cancelled()}>
						<DeliveryPanel order={order()} onChange={setOrder} />
					</Show>

					<div class="flex flex-col gap-2">
						{/* Orders added from a chat are edited in their own form. */}
						<Show when={!cancelled()}>
							<Show
								when={isChatOrder(order())}
								fallback={
									<Link
										to="/admin/orders/$orderId/edit"
										params={{ orderId: order().id }}
										class={cn(adminButton.secondary, "w-full")}
									>
										Edit order
									</Link>
								}
							>
								<Link
									to="/admin/orders/new"
									search={{ edit: order().id }}
									class={cn(adminButton.secondary, "w-full")}
								>
									Edit order
								</Link>
							</Show>
						</Show>
						<button
							type="button"
							class={cn(adminButton.secondary, "w-full")}
							disabled={busy()}
							onClick={() => markTest(!order().isTest)}
						>
							{order().isTest ? "Not a test order" : "Mark as test order"}
						</button>
						<Show when={!cancelled() && order().stage !== "done"}>
							<CancelOrderButton
								order={order()}
								class={cn(adminButton.danger, "w-full")}
								disabled={busy()}
								onCancelled={setOrder}
							>
								{order().itemCount > 1
									? "Cancel whole order & restock"
									: "Cancel order & restock"}
							</CancelOrderButton>
						</Show>
					</div>
				</aside>
			</div>
		</div>
	);
}

const ACTIVITY_SHOWN = 20;

/** Who changed what on this order, and when; reloads as the order changes. */
function OrderActivity(props: { order: Order }) {
	const [log] = createResource(
		// Each change made here replaces the order; reload the log then.
		() => props.order,
		(order) =>
			listOrderLogFn({
				data: { orderId: order.id, pageSize: ACTIVITY_SHOWN },
			}),
	);
	return (
		<section class={adminCard} aria-labelledby="activity-heading">
			<div class="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-3">
				<h2 id="activity-heading" class="font-semibold">
					Activity
				</h2>
				<Show when={(log.latest?.total ?? 0) > ACTIVITY_SHOWN}>
					<Link
						to="/admin/logs"
						search={{ area: "orders", item: props.order.id }}
						class="text-sm font-medium text-petal-700 underline-offset-2 hover:underline"
					>
						See all {log.latest?.total} changes
					</Link>
				</Show>
			</div>
			<Show
				when={log.latest}
				fallback={
					<p class="px-5 pb-5 text-sm text-petal-900/55">
						{log.error ? "Couldn’t load the activity." : "Loading…"}
					</p>
				}
			>
				{(page) => (
					<OrderLogTable
						entries={page().entries}
						compact
						empty="No changes logged yet. Changes from now on show here."
					/>
				)}
			</Show>
		</section>
	);
}

/** Rider details and proof of delivery, both shown to the customer. */
function DeliveryPanel(props: {
	order: Order;
	onChange: (order: Order) => void;
}) {
	const [riderName, setRiderName] = createSignal(
		props.order.delivery.riderName ?? "",
	);
	const [riderPhone, setRiderPhone] = createSignal(
		props.order.delivery.riderPhone ?? "",
	);
	const [saving, setSaving] = createSignal(false);
	const [uploading, setUploading] = createSignal(false);
	// Bumped after each upload so the photo reloads.
	const [photoVersion, setPhotoVersion] = createSignal(0);
	const canAddPhoto = () => props.order.stage === "done";

	const handle = async (
		action: () => Promise<OrderActionResult>,
		success: string,
	) => {
		try {
			const result = await action();
			if (result.ok) {
				props.onChange(result.order);
				toastSuccess(success);
				return true;
			}
			toastError(new Error(result.message));
		} catch (error) {
			toastError(error);
		}
		return false;
	};

	const saveRider = async (event: SubmitEvent) => {
		event.preventDefault();
		setSaving(true);
		await handle(
			() =>
				assignRider({
					data: {
						id: props.order.id,
						riderName: riderName(),
						riderPhone: riderPhone(),
					},
				}),
			"Rider saved.",
		);
		setSaving(false);
	};

	const uploadPhoto = async (files: FileList | null) => {
		const file = files?.[0];
		if (!file) return;
		setUploading(true);
		const body = new FormData();
		body.set("id", props.order.id);
		body.set("file", file);
		if (
			await handle(
				() => uploadDeliveryPhoto({ data: body }),
				"Delivery photo added.",
			)
		) {
			setPhotoVersion((v) => v + 1);
		}
		setUploading(false);
	};

	return (
		<section class={cn(adminCard, "p-5")} aria-labelledby="delivery-heading">
			<h2 id="delivery-heading" class="mb-3 font-semibold">
				Delivery
			</h2>
			<form onSubmit={saveRider} class="grid gap-3">
				<Field label="Rider’s name">
					<input
						value={riderName()}
						onInput={(e) => setRiderName(e.currentTarget.value)}
						maxLength={60}
						class={adminInput}
					/>
				</Field>
				<Field label="Rider’s phone">
					<input
						type="tel"
						value={riderPhone()}
						onInput={(e) => setRiderPhone(e.currentTarget.value)}
						maxLength={20}
						placeholder="0917 123 4567"
						class={adminInput}
					/>
				</Field>
				<button
					type="submit"
					class={cn(adminButton.secondary, "justify-self-end")}
					disabled={saving()}
				>
					{saving() ? "Saving…" : "Save rider"}
				</button>
			</form>
			<div class="mt-4 border-t border-petal-100 pt-4">
				<p class="mb-2 text-sm font-medium">Proof of delivery</p>
				<Show when={props.order.delivery.photoFile}>
					<div class="mb-3 overflow-hidden rounded-xl border border-petal-100 bg-petal-50">
						<PrivateImage
							url={`/api/orders/${props.order.id}/delivery-photo?v=${photoVersion()}`}
							alt={`Delivery photo for order ${props.order.number}`}
							class="max-h-72 w-full object-contain"
						/>
					</div>
				</Show>
				<Show
					when={canAddPhoto()}
					fallback={
						<p class="text-xs text-petal-900/55">
							You can add a photo once the order is out for delivery.
						</p>
					}
				>
					<label
						class={cn(
							adminButton.secondary,
							"w-full cursor-pointer",
							uploading() && "pointer-events-none opacity-60",
						)}
					>
						{uploading()
							? "Uploading…"
							: props.order.delivery.photoFile
								? "Replace photo"
								: "Add delivery photo"}
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							class="sr-only"
							onChange={(e) => {
								void uploadPhoto(e.currentTarget.files);
								e.currentTarget.value = "";
							}}
						/>
					</label>
				</Show>
			</div>
		</section>
	);
}
