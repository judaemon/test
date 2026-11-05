import type { JSX } from "solid-js";
import { createSignal, For, onCleanup, Show } from "solid-js";

import { adminButton, adminInput, toastSuccess } from "~/components/admin/ui";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { lineKey } from "~/lib/bouquet-messages";
import type { PricedLine } from "~/lib/pricing";
import { formatPrice, lineName } from "~/lib/product";
import { cn } from "~/lib/utils";
import { cancelBouquetFn, cancelOrderFn } from "~/server/admin/orders";
import { CANCEL_REASON_MAX, type Order } from "~/types/order";

const PROOF_MAX_BYTES = 20 * 1024 * 1024;
const PROOF_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Staff cancel an order here: a reason is required and a photo is optional.
 * The customer sees the reason, including in the public Check your order search;
 * the photo is staff-only.
 */
export function CancelOrderButton(props: {
	order: Pick<Order, "id" | "number" | "total" | "currency" | "itemCount">;
	/** Cancel just one bouquet of this line, not the whole order. */
	line?: PricedLine;
	class?: string;
	disabled?: boolean;
	children: JSX.Element;
	onCancelled: (order: Order) => void | Promise<void>;
}) {
	const [open, setOpen] = createSignal(false);
	const [reason, setReason] = createSignal("");
	const [reasonError, setReasonError] = createSignal<string>();
	const [proof, setProof] = createSignal<File>();
	const [proofUrl, setProofUrl] = createSignal<string>();
	const [formError, setFormError] = createSignal<string>();
	const [busy, setBusy] = createSignal(false);
	/** Which bouquet of the line, when it has several. */
	const [unit, setUnit] = createSignal(0);
	let reasonInput: HTMLTextAreaElement | undefined;

	const clearProof = () => {
		const url = proofUrl();
		if (url) URL.revokeObjectURL(url);
		setProofUrl(undefined);
		setProof(undefined);
	};
	onCleanup(clearProof);

	const choose = (file: File | undefined) => {
		if (!file) return;
		setFormError(undefined);
		if (!PROOF_TYPES.includes(file.type))
			return setFormError("Use a PNG, JPG or WEBP image.");
		if (file.size > PROOF_MAX_BYTES)
			return setFormError("Keep images under 20 MB.");
		clearProof();
		setProof(file);
		setProofUrl(URL.createObjectURL(file));
	};

	const changeOpen = (next: boolean) => {
		// Not while the order is being cancelled: the result would be missed.
		if (busy()) return;
		setOpen(next);
		if (!next) {
			setReason("");
			setReasonError(undefined);
			setFormError(undefined);
			clearProof();
		}
	};

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (busy()) return;
		if (!reason().trim()) {
			setReasonError("Say why this order is being cancelled.");
			reasonInput?.focus();
			return;
		}
		setFormError(undefined);
		setBusy(true);
		try {
			const body = new FormData();
			body.set("id", props.order.id);
			body.set("reason", reason());
			const file = proof();
			if (file) body.set("proof", file);
			const line = props.line;
			if (line) {
				body.set("lineKey", lineKey(line));
				body.set("unit", String(unit()));
			}
			const result = line
				? await cancelBouquetFn({ data: body })
				: await cancelOrderFn({ data: body });
			if (!result.ok) {
				setFormError(result.message);
				return;
			}
			setBusy(false);
			changeOpen(false);
			toastSuccess(
				props.line
					? `${lineName(props.line)} cancelled from order #${props.order.number} and restocked.`
					: `Order #${props.order.number} cancelled and restocked.`,
			);
			await props.onCancelled(result.order);
		} catch (error) {
			setFormError(
				error instanceof Error
					? error.message
					: "Couldn’t cancel the order. Try again.",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<button
				type="button"
				class={props.class}
				disabled={props.disabled}
				onClick={(event) => {
					// Rows in the orders table open the order when clicked.
					event.stopPropagation();
					setUnit(0);
					setOpen(true);
				}}
			>
				{props.children}
			</button>
			<AlertDialog open={open()} onOpenChange={changeOpen}>
				<AlertDialogContent class="max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl bg-white text-petal-900">
					<AlertDialogTitle class="font-display type-soft text-xl">
						{props.line
							? `Cancel one bouquet from order #${props.order.number}?`
							: props.order.itemCount > 1
								? `Cancel all ${props.order.itemCount} bouquets in order #${props.order.number}?`
								: `Cancel order #${props.order.number}?`}
					</AlertDialogTitle>
					<AlertDialogDescription class="text-sm text-petal-900/70">
						<Show
							when={props.line}
							fallback="The bouquets go back into stock and this can’t be undone. Refund the customer separately if they already paid."
						>
							{(line) => (
								<>
									{lineName(line())} goes back into stock and the rest of the
									order carries on. The total becomes{" "}
									<strong class="font-semibold">
										{formatPrice(
											props.order.total - line().unitPrice,
											props.order.currency,
										)}
									</strong>
									. This can’t be undone.
								</>
							)}
						</Show>
					</AlertDialogDescription>
					<form onSubmit={submit} noValidate class="flex flex-col gap-4">
						<Show when={props.line && props.line.quantity > 1 && props.line}>
							{(line) => (
								<fieldset class="flex flex-col gap-1.5">
									<legend class="mb-1.5 text-sm font-medium">Which one?</legend>
									<For
										each={Array.from({ length: line().quantity }, (_, i) => i)}
									>
										{(index) => {
											const message = () => line().messages?.[index];
											return (
												<label class="flex cursor-pointer items-start gap-2 rounded-xl border border-petal-200 px-3 py-2 text-sm has-[:checked]:border-petal-700 has-[:checked]:bg-petal-50">
													<input
														type="radio"
														name="cancel-unit"
														checked={unit() === index}
														onChange={() => setUnit(index)}
														class="mt-0.5 accent-petal-700"
													/>
													<span class="min-w-0 wrap-anywhere">
														Bouquet {index + 1} of {line().quantity}
														<Show when={message()?.to || message()?.message}>
															<span class="block truncate text-xs text-petal-900/60">
																Card
																{message()?.to ? ` to ${message()?.to}` : ""}:{" "}
																{message()?.message}
															</span>
														</Show>
														<Show when={message()?.note}>
															<span class="block truncate text-xs text-petal-900/60">
																Note: {message()?.note}
															</span>
														</Show>
													</span>
												</label>
											);
										}}
									</For>
								</fieldset>
							)}
						</Show>
						<label class="flex flex-col gap-1.5">
							<span class="flex justify-between gap-2 text-sm font-medium">
								Reason
								<span
									class="text-xs font-normal tabular-nums text-petal-900/50"
									aria-hidden="true"
								>
									{reason().length}/{CANCEL_REASON_MAX}
								</span>
							</span>
							<textarea
								ref={reasonInput}
								value={reason()}
								onInput={(e) => {
									setReason(e.currentTarget.value);
									setReasonError(undefined);
								}}
								required
								rows={3}
								maxLength={CANCEL_REASON_MAX}
								placeholder="Why is this order being cancelled?"
								aria-invalid={reasonError() ? "true" : undefined}
								class={cn(adminInput, "h-auto py-2")}
							/>
							<Show when={reasonError()}>
								<span class="text-xs text-destructive">{reasonError()}</span>
							</Show>
							<span class="text-xs text-petal-900/55">
								The customer sees this. It’s also on Check your order, where
								anyone who searches this customer’s name, email or serial number
								can read it. Keep private details out.
							</span>
						</label>

						<div class="flex flex-col gap-1.5">
							<span class="text-sm font-medium">
								Proof{" "}
								<span class="font-normal text-petal-900/50">(optional)</span>
							</span>
							<Show when={proofUrl()}>
								{(url) => (
									<img
										src={url()}
										alt="Chosen proof"
										class="max-h-48 w-full rounded-xl border border-petal-100 bg-petal-50 object-contain"
									/>
								)}
							</Show>
							<div class="flex flex-wrap items-center gap-2">
								<label
									class={cn(
										adminButton.secondary,
										"cursor-pointer focus-within:ring-2 focus-within:ring-petal-500",
										busy() && "pointer-events-none opacity-60",
									)}
								>
									{proof() ? "Choose another" : "Add a photo"}
									<input
										type="file"
										accept={PROOF_TYPES.join(",")}
										class="sr-only"
										disabled={busy()}
										onChange={(e) => {
											choose(e.currentTarget.files?.[0]);
											e.currentTarget.value = "";
										}}
									/>
								</label>
								<Show when={proof()}>
									<button
										type="button"
										class={adminButton.ghost}
										disabled={busy()}
										onClick={clearProof}
									>
										Remove
									</button>
								</Show>
							</div>
						</div>

						<Show when={formError()}>
							<p role="alert" class="text-sm text-destructive">
								{formError()}
							</p>
						</Show>

						<div class="flex justify-end gap-2">
							<button
								type="button"
								class={adminButton.secondary}
								disabled={busy()}
								onClick={() => changeOpen(false)}
							>
								Keep it
							</button>
							<button
								type="submit"
								class={adminButton.danger}
								disabled={busy()}
							>
								{busy()
									? "Cancelling…"
									: props.line
										? "Cancel this bouquet"
										: "Cancel order"}
							</button>
						</div>
					</form>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
