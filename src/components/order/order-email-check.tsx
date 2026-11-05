import { createSignal, onMount, Show } from "solid-js";

import { messageInput } from "~/components/checkout/bouquet-messages";
import { rememberOrderEmail } from "~/lib/order-edit";
import { cn } from "~/lib/utils";
import { confirmOrderEmail } from "~/server/orders";

/**
 * Before a shopper edits an order: they type the email it was placed with, so
 * finding an order, or having its link, isn't enough to change it.
 */
export function OrderEmailCheck(props: {
	/** One of these says which order. */
	number?: string;
	id?: string;
	onConfirmed: (orderId: string, email: string) => void;
	/** Shown as a way back out, where the check opened from a button. */
	onCancel?: () => void;
}) {
	const [email, setEmail] = createSignal("");
	const [error, setError] = createSignal("");
	const [busy, setBusy] = createSignal(false);
	const fieldId = `order-email-${props.number ?? props.id}`;
	let input: HTMLInputElement | undefined;
	// It's the only thing to do here, so it's ready to type in.
	onMount(() => input?.focus());

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (busy()) return;
		if (!email().trim()) {
			setError("Enter the email you used when you ordered.");
			return;
		}
		setBusy(true);
		setError("");
		try {
			const result = await confirmOrderEmail({
				data: { number: props.number, id: props.id, email: email() },
			});
			if (!result.ok) {
				setError(result.message);
				return;
			}
			rememberOrderEmail(result.orderId, result.email);
			props.onConfirmed(result.orderId, result.email);
		} catch {
			setError("We couldn’t check that. Check your connection and try again.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<form noValidate onSubmit={submit} class="flex flex-col gap-2">
			<label for={fieldId} class="text-sm font-medium">
				Email you used for this order
			</label>
			<p class="text-sm text-petal-900/65">
				To make sure this is your order, confirm its email first.
			</p>
			<input
				ref={input}
				id={fieldId}
				type="email"
				autocomplete="email"
				inputMode="email"
				value={email()}
				onInput={(e) => {
					setEmail(e.currentTarget.value);
					setError("");
				}}
				placeholder="you@example.com"
				aria-invalid={error() ? "true" : undefined}
				class={cn(messageInput, "h-11")}
			/>
			<Show when={error()}>
				<p role="alert" class="text-sm text-error-foreground">
					{error()}
				</p>
			</Show>
			<button
				type="submit"
				disabled={busy()}
				class="mt-1 inline-flex h-11 w-full items-center justify-center rounded-full bg-petal-700 px-5 text-sm font-medium text-white outline-none hover:bg-petal-900 focus-visible:ring-2 focus-visible:ring-petal-500 focus-visible:ring-offset-2 disabled:opacity-50"
			>
				{busy() ? "Checking…" : "Continue to edit"}
			</button>
			<Show when={props.onCancel}>
				<button
					type="button"
					onClick={() => props.onCancel?.()}
					class="h-10 rounded-full text-sm font-medium text-petal-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-petal-500"
				>
					Never mind
				</button>
			</Show>
		</form>
	);
}
