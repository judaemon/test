import { createSignal, Show } from "solid-js";
import {
	adminButton,
	adminInput,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import { validateStaffReferenceNumber } from "~/lib/payment";
import { cn } from "~/lib/utils";
import { setReferenceNumberFn } from "~/server/admin/orders";
import type { Order } from "~/types/order";

/**
 * Lets staff add, fix or remove an order's reference number, e.g. one the
 * customer sent in a chat. Works at any stage, so a balance paid later can
 * be noted too. An unpaid order with a new number waits for staff to verify.
 */
export function ReferenceNumberEditor(props: {
	order: Order;
	disabled?: boolean;
	onSaved: (order: Order) => void;
}) {
	const [editing, setEditing] = createSignal(false);
	const [value, setValue] = createSignal("");
	const [problem, setProblem] = createSignal<string>();
	const [saving, setSaving] = createSignal(false);
	const current = () => props.order.payment.referenceNumber ?? "";
	const inputId = () => `reference-${props.order.id}`;

	const open = () => {
		setValue(current());
		setProblem(undefined);
		setEditing(true);
	};

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		if (saving()) return;
		const error = validateStaffReferenceNumber(value());
		if (error) {
			setProblem(error);
			return;
		}
		setSaving(true);
		try {
			const result = await setReferenceNumberFn({
				data: { id: props.order.id, referenceNumber: value() },
			});
			if (!result.ok) throw new Error(result.message);
			props.onSaved(result.order);
			setEditing(false);
			toastSuccess(
				result.order.payment.referenceNumber
					? "Reference number saved."
					: "Reference number removed.",
			);
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Show
			when={editing()}
			fallback={
				<button
					type="button"
					class={cn(adminButton.secondary, "mt-4 w-full")}
					disabled={props.disabled}
					onClick={open}
				>
					{current() ? "Edit reference number" : "Add reference number"}
				</button>
			}
		>
			<form
				onSubmit={save}
				class="mt-4 grid gap-2 rounded-xl border border-petal-100 bg-petal-50/60 p-3"
			>
				<label for={inputId()} class="text-sm font-medium">
					Reference no.
				</label>
				<input
					id={inputId()}
					type="text"
					value={value()}
					onInput={(e) => {
						setValue(e.currentTarget.value);
						setProblem(undefined);
					}}
					maxLength={40}
					autocomplete="off"
					spellcheck={false}
					placeholder="e.g. 1012 345 678901"
					aria-invalid={problem() ? true : undefined}
					aria-describedby={`${inputId()}-hint`}
					class={cn(adminInput, "font-mono")}
					autofocus
				/>
				<p id={`${inputId()}-hint`} class="text-xs text-petal-900/60">
					<Show
						when={problem()}
						fallback="The Ref No. on the customer’s receipt. Leave it empty to remove it."
					>
						<span class="text-error-foreground">{problem()}</span>
					</Show>
				</p>
				<div class="flex gap-2">
					<button
						type="submit"
						class={cn(adminButton.primary, "flex-1")}
						disabled={saving()}
					>
						{saving() ? "Saving…" : "Save"}
					</button>
					<button
						type="button"
						class={adminButton.secondary}
						disabled={saving()}
						onClick={() => setEditing(false)}
					>
						Cancel
					</button>
				</div>
			</form>
		</Show>
	);
}
