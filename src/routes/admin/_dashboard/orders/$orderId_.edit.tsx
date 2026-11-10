import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { createSignal, For, Index, Show } from "solid-js";
import { createStore } from "solid-js/store";

import { ChangePaymentMethodButton } from "~/components/admin/change-payment-method";
import { useLeaveForm } from "~/components/admin/leave-form";
import {
	adminButton,
	adminCard,
	adminInput,
	Field,
	PageHeader,
	TextArea,
	toastError,
	toastSuccess,
} from "~/components/admin/ui";
import {
	type BouquetMessage,
	type BouquetMessageErrors,
	EMPTY_MESSAGE,
	lineKey,
	unitKey,
} from "~/lib/bouquet-messages";
import {
	CIVILIAN,
	CLASS_LABELS,
	CLASS_OPTIONS,
	COMPANIES,
	isCadetClass,
} from "~/lib/cadets";
import { isChatOrder } from "~/lib/chat-order";
import {
	type CheckoutField,
	DEDICATION_MESSAGE_MAX,
	EMAIL_MAX,
	type FieldErrors,
	NAME_MAX,
	NOTES_MAX,
	SERIAL_NUMBER_MAX,
	serialDigits,
} from "~/lib/checkout";
import { PAYMENT_METHOD_LABELS } from "~/lib/payment";
import { lineName } from "~/lib/product";
import { cn } from "~/lib/utils";
import { getAdminOrder, updateShopOrderFn } from "~/server/admin/orders";

export const Route = createFileRoute("/admin/_dashboard/orders/$orderId_/edit")(
	{
		loader: async ({ params }) => {
			const order = await getAdminOrder({ data: params.orderId });
			if (!order) throw notFound();
			return order;
		},
		// The form copies the order once, so it must never open on a kept copy
		// that's refreshed behind it: drop it on leaving, load anew each time.
		gcTime: 0,
		component: EditShopOrder,
	},
);

/** One bouquet's card and note, as the form edits them. */
interface UnitDraft extends BouquetMessage {
	key: string;
	lineKey: string;
	label: string;
}

function EditShopOrder() {
	const order = Route.useLoaderData();
	// The payment method is changed on its own, with a reason and proof, so
	// it's kept apart from the form's draft.
	const [payment, setPayment] = createSignal(order().payment);
	const params = Route.useParams();
	const { refresh, leave, stepBack } = useLeaveForm({
		routeId: Route.id,
		fallback: {
			to: "/admin/orders/$orderId",
			params: { orderId: params().orderId },
		},
	});
	const start = order().details;
	const [customer, setCustomer] = createStore({
		firstName: start.firstName,
		lastName: start.lastName,
		className: start.className,
		company: start.company,
		serialNumber: start.serialNumber,
		email: start.email,
		notes: start.notes,
		dedicationFor: start.dedicationFor,
		dedicationMessage: start.dedicationMessage,
	});
	type CustomerField = keyof typeof customer;
	// Older orders have one card for the whole order; newer ones, one per bouquet.
	const hasOrderCard = !!(start.dedicationMessage || start.dedicationFor);
	const [units, setUnits] = createStore<UnitDraft[]>(
		order().lines.flatMap((line) =>
			Array.from({ length: line.quantity }, (_, unit) => ({
				...EMPTY_MESSAGE,
				...line.messages?.[unit],
				key: unitKey(line, unit),
				lineKey: lineKey(line),
				label:
					line.quantity > 1
						? `${lineName(line)} (${unit + 1} of ${line.quantity})`
						: lineName(line),
			})),
		),
	);
	const [errors, setErrors] = createSignal<FieldErrors>({});
	const [bouquetErrors, setBouquetErrors] = createSignal<
		Record<string, BouquetMessageErrors>
	>({});
	const [saving, setSaving] = createSignal(false);
	const cadet = () => isCadetClass(customer.className);
	let formRef!: HTMLFormElement;

	const setField = (field: CustomerField, value: string) => {
		setCustomer(field, value);
		setErrors(({ [field as CheckoutField]: _, ...rest }) => rest);
	};

	const save = async (event: SubmitEvent) => {
		event.preventDefault();
		if (saving()) return;
		setSaving(true);
		try {
			const messages: Record<string, BouquetMessage[]> = {};
			for (const unit of units) {
				const list = messages[unit.lineKey] ?? [];
				list.push({ to: unit.to, message: unit.message, note: unit.note });
				messages[unit.lineKey] = list;
			}
			const result = await updateShopOrderFn({
				data: { id: order().id, details: { ...customer }, messages },
			});
			if (!result.ok) {
				setErrors(result.fieldErrors ?? {});
				setBouquetErrors(result.bouquetErrors ?? {});
				toastError(new Error(result.message));
				requestAnimationFrame(() =>
					formRef.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
				);
				return;
			}
			toastSuccess("Changes saved. They’re in the order log.");
			await refresh();
			await leave();
		} catch (error) {
			toastError(error);
		} finally {
			setSaving(false);
		}
	};

	/** A text box for one customer field, with checkout's error under it. */
	const TextField = (props: {
		label: string;
		field: "firstName" | "lastName" | "email";
		maxLength: number;
		type?: string;
	}) => (
		<div class="grid gap-1">
			<Field label={props.label}>
				<input
					type={props.type ?? "text"}
					value={customer[props.field]}
					onInput={(e) => setField(props.field, e.currentTarget.value)}
					maxLength={props.maxLength}
					autocomplete="off"
					aria-invalid={!!errors()[props.field]}
					class={adminInput}
				/>
			</Field>
			<FieldError message={errors()[props.field]} />
		</div>
	);

	return (
		<form
			ref={formRef}
			onSubmit={save}
			noValidate
			class="mx-auto max-w-3xl pb-24"
		>
			<Link
				to="/admin/orders/$orderId"
				params={{ orderId: order().id }}
				onClick={stepBack}
				class={cn(adminButton.ghost, "-ml-2 mb-2")}
			>
				← Order #{order().number}
			</Link>
			<PageHeader
				title={`Edit order #${order().number}`}
				description="Change the customer, their notes, cards and payment method. The bouquets and prices stay as they are; to take a bouquet off, cancel it on the order page. Every change goes in the order log under your name."
			/>

			<Show
				when={!isChatOrder(order()) && order().stage !== "cancelled"}
				fallback={
					<p class="rounded-2xl bg-warning px-4 py-3 text-sm text-warning-foreground">
						{order().stage === "cancelled"
							? "Cancelled orders can’t be changed."
							: "This order was added from a chat. Edit it with Edit order on its page."}
					</p>
				}
			>
				<section class={cn(adminCard, "mb-5 grid gap-4 p-5")}>
					<h2 class="font-semibold">Customer</h2>
					<div class="grid gap-4 sm:grid-cols-2">
						<TextField
							label="First name"
							field="firstName"
							maxLength={NAME_MAX}
						/>
						<TextField
							label="Last name"
							field="lastName"
							maxLength={NAME_MAX}
						/>
						<div class="grid gap-1">
							<Field label="Class">
								<select
									value={customer.className}
									onChange={(e) => {
										setField("className", e.currentTarget.value);
										// Civilians don't have a company or a serial number.
										if (!isCadetClass(e.currentTarget.value)) {
											setField("company", "");
											setField("serialNumber", "");
										}
									}}
									aria-invalid={!!errors().className}
									class={adminInput}
								>
									<option value="" disabled selected={!customer.className}>
										Choose a class
									</option>
									<For each={CLASS_OPTIONS}>
										{(value) => (
											<option
												value={value}
												selected={customer.className === value}
											>
												{CLASS_LABELS[value]}
											</option>
										)}
									</For>
								</select>
							</Field>
							<FieldError message={errors().className} />
						</div>
						<div class="grid gap-1">
							<Field label="Company">
								<select
									value={customer.company}
									onChange={(e) => setField("company", e.currentTarget.value)}
									disabled={!cadet()}
									aria-invalid={!!errors().company}
									class={adminInput}
								>
									<option value="" disabled selected={!customer.company}>
										{customer.className === CIVILIAN
											? "Not a cadet"
											: "Choose a company"}
									</option>
									<For each={COMPANIES}>
										{(company) => (
											<option
												value={company.name}
												selected={customer.company === company.name}
											>
												{company.name}
											</option>
										)}
									</For>
								</select>
							</Field>
							<FieldError message={errors().company} />
						</div>
						<Show when={cadet()}>
							<div class="grid gap-1">
								<Field
									label="Serial number"
									hint="Digits only, e.g. 12345 for C-12345."
								>
									<input
										value={customer.serialNumber}
										onInput={(e) =>
											setField(
												"serialNumber",
												serialDigits(e.currentTarget.value),
											)
										}
										inputMode="numeric"
										maxLength={SERIAL_NUMBER_MAX}
										aria-invalid={!!errors().serialNumber}
										class={cn(adminInput, "tabular-nums")}
									/>
								</Field>
								<FieldError message={errors().serialNumber} />
							</div>
						</Show>
						<TextField
							label="Email"
							field="email"
							type="email"
							maxLength={EMAIL_MAX}
						/>
					</div>
				</section>

				<section class={cn(adminCard, "mb-5 grid gap-3 p-5")}>
					<h2 class="font-semibold">Payment method</h2>
					<p class="text-sm">
						Paid by{" "}
						<strong class="font-semibold">
							{PAYMENT_METHOD_LABELS[payment().method]}
						</strong>
					</p>
					<Show
						when={payment().method !== "card"}
						fallback={
							<p class="text-xs text-petal-900/60">
								Card payments were taken at checkout and can’t be switched.
							</p>
						}
					>
						<p class="text-xs text-petal-900/60">
							If the customer paid another way than they chose (e.g. chose GCash
							but sent a bank transfer), change it so reports add it up right.
							You’ll need a reason and a photo of the payment. It’s saved
							straight away and goes in the order log.
						</p>
						<ChangePaymentMethodButton
							order={{ ...order(), payment: payment() }}
							class={cn(adminButton.secondary, "justify-self-start")}
							disabled={saving()}
							onChanged={(changed) => setPayment(changed.payment)}
						>
							Change payment method
						</ChangePaymentMethodButton>
					</Show>
				</section>

				<section class={cn(adminCard, "mb-5 grid gap-4 p-5")}>
					<h2 class="font-semibold">Order note</h2>
					<div class="grid gap-1">
						<Field
							label="Note for the whole order"
							hint="Optional. Notes for one bouquet go with it below."
						>
							<TextArea
								value={customer.notes}
								onInput={(e) => setField("notes", e.currentTarget.value)}
								maxLength={NOTES_MAX}
								rows={3}
								aria-invalid={!!errors().notes}
								class={adminInput}
							/>
						</Field>
						<FieldError message={errors().notes} />
					</div>
					<Show when={hasOrderCard}>
						<div class="grid gap-4 sm:grid-cols-[1fr_2fr]">
							<div class="grid gap-1">
								<Field label="Card to" hint="Optional.">
									<input
										value={customer.dedicationFor}
										onInput={(e) =>
											setField("dedicationFor", e.currentTarget.value)
										}
										maxLength={NAME_MAX}
										aria-invalid={!!errors().dedicationFor}
										class={adminInput}
									/>
								</Field>
								<FieldError message={errors().dedicationFor} />
							</div>
							<div class="grid gap-1">
								<Field label="Card message" hint="Empty means no card.">
									<TextArea
										value={customer.dedicationMessage}
										onInput={(e) =>
											setField("dedicationMessage", e.currentTarget.value)
										}
										maxLength={DEDICATION_MESSAGE_MAX}
										rows={3}
										aria-invalid={!!errors().dedicationMessage}
										class={adminInput}
									/>
								</Field>
								<FieldError message={errors().dedicationMessage} />
							</div>
						</div>
					</Show>
				</section>

				<section class={cn(adminCard, "grid gap-5 p-5")}>
					<h2 class="font-semibold">Cards &amp; notes</h2>
					<Index each={units}>
						{(unit, index) => {
							const problems = () => bouquetErrors()[unit().key] ?? {};
							const set = (field: keyof BouquetMessage, value: string) => {
								setUnits(index, field, value);
								setBouquetErrors(({ [unit().key]: _, ...rest }) => rest);
							};
							return (
								<fieldset class="grid gap-3 border-t border-petal-50 pt-4 first-of-type:border-t-0 first-of-type:pt-0">
									<legend class="mb-2 text-sm font-semibold">
										{unit().label}
									</legend>
									<div class="grid gap-4 sm:grid-cols-[1fr_2fr]">
										<div class="grid gap-1">
											<Field label="Card to" hint="Optional.">
												<input
													value={unit().to}
													onInput={(e) => set("to", e.currentTarget.value)}
													maxLength={NAME_MAX}
													aria-invalid={!!problems().to}
													class={adminInput}
												/>
											</Field>
											<FieldError message={problems().to} />
										</div>
										<div class="grid gap-1">
											<Field label="Card message" hint="Empty means no card.">
												<TextArea
													value={unit().message}
													onInput={(e) => set("message", e.currentTarget.value)}
													maxLength={DEDICATION_MESSAGE_MAX}
													rows={3}
													aria-invalid={!!problems().message}
													class={adminInput}
												/>
											</Field>
											<FieldError message={problems().message} />
										</div>
									</div>
									<div class="grid gap-1">
										<Field label="Customer’s note" hint="For the florist.">
											<TextArea
												value={unit().note}
												onInput={(e) => set("note", e.currentTarget.value)}
												maxLength={NOTES_MAX}
												rows={2}
												aria-invalid={!!problems().note}
												class={adminInput}
											/>
										</Field>
										<FieldError message={problems().note} />
									</div>
								</fieldset>
							);
						}}
					</Index>
				</section>

				<div class="fixed inset-x-0 bottom-0 z-30 border-t border-petal-100 bg-white/95 px-4 py-3 backdrop-blur lg:left-[240px]">
					<div class="mx-auto flex max-w-3xl items-center justify-end gap-2">
						<Link
							to="/admin/orders/$orderId"
							params={{ orderId: order().id }}
							onClick={stepBack}
							class={adminButton.secondary}
						>
							Cancel
						</Link>
						<button
							type="submit"
							class={adminButton.primary}
							disabled={saving()}
						>
							{saving() ? "Saving…" : "Save changes"}
						</button>
					</div>
				</div>
			</Show>
		</form>
	);
}

function FieldError(props: { message?: string }) {
	return (
		<Show when={props.message}>
			<span role="alert" class="text-xs text-error-foreground">
				{props.message}
			</span>
		</Show>
	);
}
