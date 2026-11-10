import type { JSX } from "solid-js";
import { createSignal, For, Show } from "solid-js";

import { ProofPicker } from "~/components/admin/proof-picker";
import { adminButton, adminInput, toastSuccess } from "~/components/admin/ui";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
	PAYMENT_METHOD_LABELS,
	PAYMENT_METHODS,
	type PaymentMethod,
} from "~/lib/payment";
import { cn } from "~/lib/utils";
import { changePaymentMethodFn } from "~/server/admin/orders";
import { type Order, PAYMENT_CHANGE_REASON_MAX } from "~/types/order";

/**
 * Staff switch how an order is paid: a reason and a photo as proof are both
 * required, and both staff-only. Card is left out: it's only taken at checkout.
 */
export function ChangePaymentMethodButton(props: {
	order: Pick<Order, "id" | "number" | "payment">;
	class?: string;
	disabled?: boolean;
	children: JSX.Element;
	onChanged: (order: Order) => void;
}) {
	const [open, setOpen] = createSignal(false);
	const [method, setMethod] = createSignal<PaymentMethod>();
	const [methodError, setMethodError] = createSignal<string>();
	const [reason, setReason] = createSignal("");
	const [reasonError, setReasonError] = createSignal<string>();
	const [proof, setProof] = createSignal<File>();
	const [proofError, setProofError] = createSignal<string>();
	const [formError, setFormError] = createSignal<string>();
	const [busy, setBusy] = createSignal(false);
	let reasonInput: HTMLTextAreaElement | undefined;

	const choices = () =>
		PAYMENT_METHODS.filter(
			(option) => option !== "card" && option !== props.order.payment.method,
		);

	const changeOpen = (next: boolean) => {
		// Not while it's saving: the result would be missed.
		if (busy()) return;
		setOpen(next);
		if (!next) {
			setMethod(undefined);
			setMethodError(undefined);
			setReason("");
			setReasonError(undefined);
			setFormError(undefined);
			setProof(undefined);
			setProofError(undefined);
		}
	};

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (busy()) return;
		const chosen = method();
		if (!chosen) {
			setMethodError("Choose the new payment method.");
			return;
		}
		if (!reason().trim()) {
			setReasonError("Say why the payment method is changing.");
			reasonInput?.focus();
			return;
		}
		const file = proof();
		if (!file) {
			setProofError(
				"Add a photo of the payment, e.g. the bank receipt the customer sent.",
			);
			return;
		}
		setFormError(undefined);
		setBusy(true);
		try {
			const body = new FormData();
			body.set("id", props.order.id);
			body.set("method", chosen);
			body.set("reason", reason());
			body.set("proof", file);
			const result = await changePaymentMethodFn({ data: body });
			if (!result.ok) {
				setFormError(result.message);
				return;
			}
			setBusy(false);
			changeOpen(false);
			toastSuccess(
				`Order #${props.order.number} is now paid by ${PAYMENT_METHOD_LABELS[chosen]}.`,
			);
			props.onChanged(result.order);
		} catch (error) {
			setFormError(
				error instanceof Error
					? error.message
					: "Couldn’t change the payment method. Try again.",
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
				onClick={() => setOpen(true)}
			>
				{props.children}
			</button>
			<AlertDialog open={open()} onOpenChange={changeOpen}>
				<AlertDialogContent class="max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl bg-white text-petal-900">
					<AlertDialogTitle class="font-display type-soft text-xl">
						Change payment method for order #{props.order.number}?
					</AlertDialogTitle>
					<AlertDialogDescription class="text-sm text-petal-900/70">
						It’s paid by{" "}
						<strong class="font-semibold">
							{PAYMENT_METHOD_LABELS[props.order.payment.method]}
						</strong>{" "}
						now. The payment status stays as it is, so verify the new payment as
						usual.
					</AlertDialogDescription>
					<form onSubmit={submit} noValidate class="flex flex-col gap-4">
						<fieldset class="flex flex-col gap-1.5">
							<legend class="mb-1.5 text-sm font-medium">New method</legend>
							<For each={choices()}>
								{(option) => (
									<label class="flex cursor-pointer items-center gap-2 rounded-xl border border-petal-200 px-3 py-2 text-sm has-[:checked]:border-petal-700 has-[:checked]:bg-petal-50">
										<input
											type="radio"
											name="payment-method"
											checked={method() === option}
											disabled={busy()}
											onChange={() => {
												setMethod(option);
												setMethodError(undefined);
											}}
											class="accent-petal-700"
										/>
										{PAYMENT_METHOD_LABELS[option]}
									</label>
								)}
							</For>
							<Show when={methodError()}>
								<span class="text-xs text-destructive">{methodError()}</span>
							</Show>
						</fieldset>

						<label class="flex flex-col gap-1.5">
							<span class="flex justify-between gap-2 text-sm font-medium">
								Reason
								<span
									class="text-xs font-normal tabular-nums text-petal-900/50"
									aria-hidden="true"
								>
									{reason().length}/{PAYMENT_CHANGE_REASON_MAX}
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
								maxLength={PAYMENT_CHANGE_REASON_MAX}
								placeholder="Why is the payment method changing?"
								aria-invalid={reasonError() ? "true" : undefined}
								class={cn(adminInput, "h-auto py-2")}
							/>
							<Show when={reasonError()}>
								<span class="text-xs text-destructive">{reasonError()}</span>
							</Show>
							<span class="text-xs text-petal-900/55">
								Only staff see the reason and the photo. Both go in the order
								log.
							</span>
						</label>

						<div class="flex flex-col gap-1.5">
							<ProofPicker
								file={proof()}
								onChange={(file) => {
									setProof(file);
									if (file) setProofError(undefined);
								}}
								onError={setFormError}
								disabled={busy()}
								hint="(required)"
							/>
							<Show when={proofError()}>
								<span class="text-xs text-destructive">{proofError()}</span>
							</Show>
							<span class="text-xs text-petal-900/55">
								A screenshot or photo of the payment as it was really made.
							</span>
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
								class={adminButton.primary}
								disabled={busy()}
							>
								{busy() ? "Saving…" : "Change method"}
							</button>
						</div>
					</form>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
