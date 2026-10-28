import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/solid-router";
import { createEffect, createSignal, For, on, Show } from "solid-js";

import {
	adminButton,
	adminCard,
	adminInput,
	ConfirmButton,
	Field,
	PageHeader,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { PaymentStatusPill } from "~/components/order/payment-status";
import { PrivateImage } from "~/components/order/private-image";
import { formatSlot, getSlot } from "~/lib/checkout";
import { CARD_BRAND_LABELS, PAYMENT_METHOD_LABELS } from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import { formatDate } from "~/lib/time";
import { cn } from "~/lib/utils";
import {
	assignRider,
	getAdminOrder,
	moveOrder,
	type OrderActionResult,
	reviewOrderPayment,
	uploadDeliveryPhoto,
} from "~/server/admin/orders";
import {
	BOARD_STAGES,
	isPaymentSettled,
	type Order,
	type OrderStage,
	STAGE_LABELS,
} from "~/types/order";

/** Proof URLs leave off the extension (see `publicUploadUrl`). */
const proofId = (fileName: string) => fileName.replace(/\.(png|jpg|webp)$/, "");

export const Route = createFileRoute("/admin/_dashboard/orders/$orderId")({
	loader: async ({ params }) => {
		const order = await getAdminOrder({ data: params.orderId });
		if (!order) throw notFound();
		return order;
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
	const router = useRouter();
	const [order, setOrder] = createSignal<Order>(loaded());
	createEffect(on(loaded, (fresh) => setOrder(fresh), { defer: true }));
	const [busy, setBusy] = createSignal(false);

	const details = () => order().details;
	const payment = () => order().payment;
	const slot = () => getSlot(details().deliverySlot);
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

	const moveTo = (stage: OrderStage) =>
		run(
			() => moveOrder({ data: { id: order().id, stage } }),
			`Moved to ${STAGE_LABELS[stage]}.`,
		);
	const review = (decision: "verified" | "rejected") =>
		run(
			() => reviewOrderPayment({ data: { id: order().id, decision } }),
			decision === "verified"
				? "Payment verified."
				: "Payment marked as rejected.",
		);

	return (
		<div>
			<Link
				to="/admin"
				onClick={(event) => {
					// Back to the board as it was (same day, filters and scroll).
					if (router.history.canGoBack()) {
						event.preventDefault();
						router.history.back();
					}
				}}
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
				actions={
					<span class="rounded-full bg-white px-3 py-1 text-sm font-medium">
						{STAGE_LABELS[order().stage]}
					</span>
				}
			/>

			<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
				<div class="flex flex-col gap-5">
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
							<Show when={!isPaymentSettled(payment().status)}>
								<p class="mt-3 text-sm text-warning-foreground">
									Verify the payment before moving this order past “New orders”.
								</p>
							</Show>
						</Show>
					</section>

					<section class={cn(adminCard, "p-5")}>
						<h2 class="mb-3 font-semibold">Bouquets</h2>
						<ul class="flex flex-col gap-3">
							<For each={order().lines}>
								{(line) => (
									<li class="flex items-center gap-3">
										<img
											src={line.image}
											alt=""
											class="size-14 rounded-xl bg-petal-50 object-cover"
										/>
										<span class="min-w-0 flex-1">
											<span class="block font-medium">
												{line.quantity} × {line.colorName}
											</span>
											<span class="block text-xs text-petal-900/55">
												{line.title} · {line.sku}
											</span>
										</span>
										<span class="text-sm tabular-nums">
											{formatPrice(line.lineTotal, order().currency)}
										</span>
									</li>
								)}
							</For>
						</ul>
						<dl class="mt-4 grid grid-cols-[1fr_auto] gap-y-1 border-t border-petal-100 pt-3 text-sm">
							<dt class="text-petal-900/65">Delivery</dt>
							<dd class="text-right">Free</dd>
							<dt class="font-semibold">Total</dt>
							<dd class="text-right font-semibold tabular-nums">
								{formatPrice(order().total, order().currency)}
							</dd>
						</dl>
					</section>

					<section class={cn(adminCard, "grid gap-5 p-5 sm:grid-cols-2")}>
						<div>
							<h2 class="mb-2 font-semibold">Deliver to</h2>
							<address class="text-sm not-italic leading-relaxed">
								<strong class="font-medium">{details().recipientName}</strong>
								<br />
								{details().address}
								<br />
								{details().city} {details().postalCode}
							</address>
							<p class="mt-2 text-sm">
								<strong class="font-medium">
									{formatDate(details().deliveryDate)}
								</strong>
								<br />
								<Show when={slot()} fallback="—">
									{(s) => formatSlot(s())}
								</Show>
							</p>
						</div>
						<div>
							<h2 class="mb-2 font-semibold">Customer</h2>
							<p class="flex flex-col gap-1 text-sm">
								<a
									href={`tel:${details().phone.replace(/[^\d+]/g, "")}`}
									class="text-petal-700 underline-offset-2 hover:underline"
								>
									{details().phone}
								</a>
								<a
									href={`mailto:${details().email}`}
									class="break-all text-petal-700 underline-offset-2 hover:underline"
								>
									{details().email}
								</a>
							</p>
						</div>
					</section>

					<section class={cn(adminCard, "p-5")}>
						<h2 class="mb-2 font-semibold">Card message</h2>
						<Show
							when={details().giftMessage}
							fallback={
								<p class="text-sm text-petal-900/55">No card message.</p>
							}
						>
							<blockquote class="rounded-xl bg-petal-50 px-4 py-3 font-display text-lg italic">
								“{details().giftMessage}”
							</blockquote>
						</Show>
					</section>
				</div>

				<aside class="flex flex-col gap-5 lg:sticky lg:top-6">
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
							<Show when={payment().reviewedBy}>
								<dt class="text-petal-900/60">Checked by</dt>
								<dd>{payment().reviewedBy}</dd>
							</Show>
						</dl>
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
						<Show when={payment().method !== "card" && !cancelled()}>
							<p class="mt-3 text-xs text-petal-900/60">
								Check that the amount and reference number match your{" "}
								{PAYMENT_METHOD_LABELS[payment().method]} history.
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
										order().stage !== "new"
									}
									onClick={() => review("rejected")}
								>
									Reject
								</button>
							</div>
						</Show>
					</section>

					<Show when={!cancelled()}>
						<DeliveryPanel order={order()} onChange={setOrder} />
					</Show>

					<Show when={!cancelled() && order().stage !== "done"}>
						<ConfirmButton
							class={cn(adminButton.danger, "w-full")}
							disabled={busy()}
							title="Cancel this order?"
							description="The bouquets go back into stock and the order leaves the board. Refund the customer separately if they already paid."
							confirmLabel="Cancel order"
							onConfirm={() => moveTo("cancelled")}
						>
							Cancel order & restock
						</ConfirmButton>
					</Show>
				</aside>
			</div>
		</div>
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
	const canAddPhoto = () =>
		props.order.stage === "delivering" || props.order.stage === "done";

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
