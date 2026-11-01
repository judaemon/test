import * as Dialog from "@kobalte/core/dialog";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import type { JSX } from "solid-js";
import { createSignal, For, Match, Show, Switch } from "solid-js";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { ChoiceSelect } from "~/components/checkout/choice-select";
import { PaymentSection } from "~/components/checkout/payment-section";
import { ColorSwatch } from "~/components/order/company-label";
import { FlowerMark } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import {
	TextField,
	TextFieldDescription,
	TextFieldErrorMessage,
	TextFieldInput,
	TextFieldLabel,
	TextFieldTextArea,
} from "~/components/ui/text-field";
import {
	CIVILIAN,
	CLASS_LABELS,
	CLASS_OPTIONS,
	COMPANIES,
	companyColor,
} from "~/lib/cadets";
import { cartStore, clearCart, setCartOpen } from "~/lib/cart-store";
import {
	type CheckoutField,
	DEDICATION_MESSAGE_MAX,
	type FieldErrors,
	hasErrors,
	NAME_MAX,
	NOTES_MAX,
	type PaymentField,
	readCheckoutForm,
	validateCheckoutDetails,
} from "~/lib/checkout";
import { rememberOrder } from "~/lib/my-orders";
import {
	type CardInput,
	cardDigits,
	detectCardBrand,
	isQrPayment,
	ON_HOLD_NOTICE,
	PAYMENT_METHOD_LABELS,
	type PaymentMethod,
	validateCard,
	validateReferenceNumber,
} from "~/lib/payment";
import type { PricedCart } from "~/lib/pricing";
import { formatPrice, lineName, styleLabel } from "~/lib/product";
import { usePricedCart, useSessionUser } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import { getCheckoutConfig, placeOrder } from "~/server/orders";
import type { PaymentAccount } from "~/types/payment";

export const Route = createFileRoute("/checkout")({
	loader: () => getCheckoutConfig(),
	head: () => ({ meta: [{ title: "Checkout · ORAIA" }] }),
	component: CheckoutPage,
});

function CheckoutPage() {
	const cartState = useSelector(cartStore);
	const cart = usePricedCart();
	const config = Route.useLoaderData();
	const user = useSessionUser();

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6 lg:px-8">
				<div class="flex flex-wrap items-end justify-between gap-3">
					<h1 class="font-display type-soft text-4xl font-semibold tracking-tight">
						Checkout
					</h1>
					<Show
						when={user()}
						fallback={
							<p class="text-sm text-petal-900/65">
								No account needed. Have one?{" "}
								<Link
									to="/sign-in"
									search={{ redirect: "/checkout" }}
									class="font-medium text-petal-700 underline underline-offset-2"
								>
									Sign in
								</Link>{" "}
								to track this order.
							</p>
						}
					>
						{(signedIn) => (
							<p class="text-sm text-petal-900/65">
								Signed in as {signedIn().email} — you can track this order from
								your account.
							</p>
						)}
					</Show>
				</div>
				<Switch>
					{/* The bag lives in localStorage, so wait for it before deciding it's empty. */}
					<Match when={!cartState().hydrated}>
						<div
							aria-busy="true"
							class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]"
						>
							<p class="sr-only">Loading your bag…</p>
							<div class="h-96 animate-pulse rounded-3xl bg-petal-100/60" />
							<div class="h-72 animate-pulse rounded-3xl bg-petal-100/60" />
						</div>
					</Match>
					<Match when={cart().lines.length === 0}>
						<EmptyCheckout />
					</Match>
					<Match when={cart().lines.length > 0}>
						<CheckoutForm
							cart={cart()}
							paymentAccounts={config().paymentAccounts}
							name={user()?.name}
						/>
					</Match>
				</Switch>
			</main>
			<SiteFooter />
		</div>
	);
}

const chip =
	"flex h-full items-center justify-center rounded-2xl border border-petal-200 bg-white px-4 py-3 text-center text-sm font-medium transition-colors hover:border-petal-300 peer-checked:border-petal-700 peer-checked:bg-petal-50 peer-checked:shadow-[inset_0_0_0_1px] peer-checked:shadow-petal-700 peer-focus-visible:ring-2 peer-focus-visible:ring-petal-500 peer-focus-visible:ring-offset-2";

const textAreaClass =
	"rounded-xl border-petal-200 bg-white text-base placeholder:text-petal-900/35 focus-visible:ring-petal-500 sm:text-sm";

function CheckoutForm(props: {
	cart: PricedCart;
	paymentAccounts: PaymentAccount[];
	/** Signed-in shopper's name, used to prefill the name field. */
	name?: string;
}) {
	const navigate = useNavigate();
	const [errors, setErrors] = createSignal<FieldErrors>({});
	const [formError, setFormError] = createSignal<string | null>(null);
	const [submitting, setSubmitting] = createSignal(false);
	const [className, setClassName] = createSignal("");
	const [company, setCompany] = createSignal("");
	const [addDedication, setAddDedication] = createSignal(false);
	// Controlled, so the review step edits the same text as the form.
	const [notes, setNotes] = createSignal("");
	const [dedicationFor, setDedicationFor] = createSignal("");
	const [dedicationMessage, setDedicationMessage] = createSignal("");
	/** Open once the form is valid: a last look (and edit) before placing. */
	const [reviewing, setReviewing] = createSignal(false);
	/** Ticked in the review: orders can't be cancelled once placed. */
	const [noCancelAccepted, setNoCancelAccepted] = createSignal(false);
	/** "To follow": order now, send the reference number later. */
	const [referenceLater, setReferenceLater] = createSignal(false);
	let formRef!: HTMLFormElement;
	const [paymentMethod, setPaymentMethod] = createSignal<PaymentMethod | null>(
		null,
	);
	const [card, setCard] = createSignal<CardInput>({
		number: "",
		name: "",
		expiry: "",
		cvc: "",
	});
	const hasProblem = () => props.cart.lines.some((line) => line.problem);
	/** Only QR payments can wait; the choice is ignored if they switch to card. */
	const onHold = () => {
		const method = paymentMethod();
		return referenceLater() && !!method && isQrPayment(method);
	};
	/** Best guess from the account name: first word, then the rest. */
	const nameParts = () => {
		const [first = "", ...rest] = (props.name ?? "").trim().split(/\s+/);
		return { first, last: rest.join(" ") };
	};

	const clearError = (field: CheckoutField | PaymentField) => {
		if (!errors()[field]) return;
		setErrors(({ [field]: _, ...rest }) => rest);
	};

	const chooseDedication = (on: boolean) => {
		setAddDedication(on);
		clearError("dedicationFor");
		clearError("dedicationMessage");
	};

	const focusFirstInvalid = (form: HTMLFormElement) =>
		requestAnimationFrame(() =>
			form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
		);

	const validatePayment = (form: FormData): FieldErrors => {
		const method = paymentMethod();
		if (!method) return { paymentMethod: "Choose how you’d like to pay." };
		if (isQrPayment(method)) {
			if (referenceLater()) return {};
			const reference = form.get("referenceNumber");
			return {
				referenceNumber: validateReferenceNumber(
					typeof reference === "string" ? reference : "",
				),
			};
		}
		const cardErrors = validateCard(card(), new Date());
		return {
			cardNumber: cardErrors.number,
			cardName: cardErrors.name,
			cardExpiry: cardErrors.expiry,
			cardCvc: cardErrors.cvc,
		};
	};

	/** Checks the whole form; returns its data when everything is valid. */
	const validateForm = () => {
		const formData = new FormData(formRef);
		const details = readCheckoutForm(formData);
		const fieldErrors = withoutEmpty({
			...validateCheckoutDetails(details),
			...validatePayment(formData),
		});
		setErrors(fieldErrors);
		setFormError(null);
		return hasErrors(fieldErrors) ? null : { formData, details };
	};

	// "Place order" on the form opens the review; nothing is saved yet.
	const handleSubmit = (event: SubmitEvent) => {
		event.preventDefault();
		if (submitting() || hasProblem()) return;
		if (validateForm()) {
			setNoCancelAccepted(false);
			setReviewing(true);
		} else focusFirstInvalid(formRef);
	};

	/** Places the order from the review dialog, with any edits made there. */
	const placeNow = async () => {
		if (submitting() || hasProblem() || !noCancelAccepted()) return;
		const valid = validateForm();
		if (!valid) {
			// Notes and dedication problems can be fixed right in the review.
			const inReview = Object.keys(errors()).every((field) =>
				["notes", "dedicationFor", "dedicationMessage"].includes(field),
			);
			if (!inReview) {
				setReviewing(false);
				focusFirstInvalid(formRef);
			}
			return;
		}
		const { formData, details } = valid;
		const form = formRef;

		setSubmitting(true);
		try {
			// Build the request from an allowlist rather than the raw form: UI
			// libraries may name inputs on their own, and the full card number,
			// expiry and CVC must never leave the browser.
			const payload = new FormData();
			for (const [field, value] of Object.entries(details)) {
				payload.set(field, String(value));
			}
			payload.set("lines", JSON.stringify(cartStore.state.lines));
			payload.set("noCancellationAccepted", String(noCancelAccepted()));
			const method = paymentMethod() as PaymentMethod;
			payload.set("paymentMethod", method);
			if (isQrPayment(method)) {
				payload.set("referenceLater", String(referenceLater()));
				const reference = formData.get("referenceNumber");
				payload.set(
					"referenceNumber",
					typeof reference === "string" ? reference : "",
				);
			} else if (method === "card") {
				const digits = cardDigits(card().number);
				payload.set("cardBrand", detectCardBrand(digits));
				payload.set("cardLast4", digits.slice(-4));
			}
			const result = await placeOrder({ data: payload });
			if (!result.ok) {
				setFormError(result.message);
				if (result.fieldErrors) {
					setErrors(result.fieldErrors);
					setReviewing(false);
					focusFirstInvalid(form);
				}
				return;
			}
			rememberOrder(result.number, result.orderId);
			// Leave the page before emptying the bag so it never flashes "empty".
			await navigate({
				to: "/order/$orderId",
				params: { orderId: result.orderId },
			});
			clearCart();
		} catch {
			setFormError(
				"We couldn’t place your order. Check your connection and try again.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form
			ref={formRef}
			noValidate
			onSubmit={handleSubmit}
			class="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]"
		>
			<div class="flex flex-col gap-6">
				<Section title="Your details" step={1}>
					<div class="flex flex-col gap-4">
						<ChoiceSelect
							name="className"
							label="Class"
							placeholder="Choose your class"
							options={CLASS_OPTIONS}
							optionLabel={(value) =>
								CLASS_LABELS[value as keyof typeof CLASS_LABELS] ?? value
							}
							value={className()}
							onChange={(value) => {
								setClassName(value);
								// Civilians don't belong to a company.
								if (value === CIVILIAN) setCompany("");
								clearError("className");
								clearError("company");
							}}
							error={errors().className}
						/>
						<ChoiceSelect
							name="company"
							label="Company"
							placeholder={
								className() === CIVILIAN
									? "Not needed for civilians"
									: "Choose your company"
							}
							options={COMPANIES.map((company) => company.name)}
							optionPrefix={(value) => (
								<ColorSwatch color={companyColor(value)} />
							)}
							value={company()}
							onChange={(value) => {
								setCompany(value);
								clearError("company");
							}}
							disabled={className() === CIVILIAN}
							error={errors().company}
						/>
						<Field
							name="lastName"
							label="Last name"
							autocomplete="family-name"
							maxLength={NAME_MAX}
							defaultValue={nameParts().last}
							error={errors().lastName}
							onInput={() => clearError("lastName")}
						/>
						<Field
							name="firstName"
							label="First name"
							autocomplete="given-name"
							maxLength={NAME_MAX}
							defaultValue={nameParts().first}
							error={errors().firstName}
							onInput={() => clearError("firstName")}
						/>
					</div>
				</Section>

				<Section title="Notes & dedication card" step={2}>
					<div class="flex flex-col gap-5">
						<TextField
							name="notes"
							value={notes()}
							onChange={setNotes}
							validationState={errors().notes ? "invalid" : "valid"}
							class="gap-2"
						>
							<TextFieldLabel class="text-petal-900">
								Notes{" "}
								<span class="font-normal text-petal-900/50">(optional)</span>
							</TextFieldLabel>
							<TextFieldTextArea
								maxLength={NOTES_MAX}
								rows={2}
								placeholder="Anything we should know about your order"
								onInput={() => clearError("notes")}
								class={textAreaClass}
							/>
							<TextFieldErrorMessage>{errors().notes}</TextFieldErrorMessage>
						</TextField>

						<fieldset>
							<legend class="mb-2 text-sm font-medium">
								Free dedication card
							</legend>
							<p class="-mt-1 mb-2 text-sm text-petal-900/60">
								We print your message on a card and tuck it into the bouquet, at
								no extra cost.
							</p>
							<input
								type="hidden"
								name="addDedication"
								value={String(addDedication())}
							/>
							<div class="grid grid-cols-2 gap-2">
								<For
									each={
										[
											[false, "No card"],
											[true, "Add a free card"],
										] as const
									}
								>
									{([value, label]) => (
										<label class="cursor-pointer">
											<input
												type="radio"
												name="dedicationChoice"
												checked={addDedication() === value}
												onChange={() => chooseDedication(value)}
												class="peer sr-only"
											/>
											<span class={chip}>{label}</span>
										</label>
									)}
								</For>
							</div>
						</fieldset>

						<Show when={addDedication()}>
							<div class="flex flex-col gap-4 rounded-2xl bg-petal-50 p-5">
								<Field
									name="dedicationFor"
									label="To"
									placeholder="Who the card is addressed to"
									autocomplete="off"
									maxLength={NAME_MAX}
									value={dedicationFor()}
									onValueChange={setDedicationFor}
									error={errors().dedicationFor}
									onInput={() => clearError("dedicationFor")}
								/>
								<TextField
									name="dedicationMessage"
									value={dedicationMessage()}
									onChange={setDedicationMessage}
									validationState={
										errors().dedicationMessage ? "invalid" : "valid"
									}
									class="gap-2"
								>
									<TextFieldLabel class="text-petal-900">
										Message
									</TextFieldLabel>
									<TextFieldTextArea
										maxLength={DEDICATION_MESSAGE_MAX}
										rows={5}
										placeholder="Happy birthday, sunshine! 🌷"
										onInput={() => clearError("dedicationMessage")}
										class={textAreaClass}
									/>
									<div class="flex justify-between gap-4">
										<TextFieldDescription class="text-petal-900/60">
											Printed on a card tucked into the bouquet.
										</TextFieldDescription>
										<span
											class="shrink-0 text-xs tabular-nums text-petal-900/50"
											aria-hidden="true"
										>
											{dedicationMessage().length}/{DEDICATION_MESSAGE_MAX}
										</span>
									</div>
									<TextFieldErrorMessage>
										{errors().dedicationMessage}
									</TextFieldErrorMessage>
								</TextField>
							</div>
						</Show>
					</div>
				</Section>

				<Section title="Payment" step={3}>
					<PaymentSection
						accounts={props.paymentAccounts}
						total={props.cart.total}
						currency={props.cart.currency}
						method={paymentMethod()}
						onMethodChange={setPaymentMethod}
						card={card()}
						onCardChange={(patch) =>
							setCard((current) => ({ ...current, ...patch }))
						}
						errors={errors()}
						clearError={clearError}
						referenceLater={referenceLater()}
						onReferenceLaterChange={setReferenceLater}
					/>
				</Section>
			</div>

			<aside
				aria-labelledby="summary-heading"
				class="flex flex-col gap-4 rounded-3xl border border-petal-100 bg-white p-6 lg:sticky lg:top-24"
			>
				<div class="flex items-center justify-between">
					<h2
						id="summary-heading"
						class="font-display type-soft text-xl font-semibold"
					>
						Order summary
					</h2>
					<button
						type="button"
						onClick={() => setCartOpen(true)}
						class="rounded-full px-2 py-2.5 text-sm text-petal-700 underline-offset-4 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500 sm:py-1"
					>
						Edit bag
					</button>
				</div>

				<ul class="flex flex-col gap-4">
					<For each={props.cart.lines}>
						{(line) => (
							<li class="flex items-center gap-3">
								<span class="relative shrink-0">
									<img
										src={line.image}
										alt=""
										width={56}
										height={56}
										class="size-14 rounded-xl bg-petal-50 object-cover"
									/>
									<span class="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-petal-700 px-1 text-[11px] font-semibold leading-5 text-white">
										<span class="sr-only">Quantity </span>
										{line.quantity}
									</span>
								</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium">
										{line.title}
									</span>
									<span class="block text-sm text-petal-900/60">
										{styleLabel(line)}
									</span>
									<Show when={line.problem}>
										<span class="block text-sm text-error-foreground">
											{line.problem === "unavailable"
												? `${line.problemText} Remove it to continue.`
												: line.problem === "sold-out"
													? "Not available — remove to continue"
													: `Only ${line.maxQuantity} available`}
										</span>
									</Show>
								</span>
								<span class="text-sm font-medium tabular-nums">
									{formatPrice(line.lineTotal, props.cart.currency)}
								</span>
							</li>
						)}
					</For>
				</ul>

				<dl class="grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-petal-100 pt-4 text-sm">
					<dt class="text-petal-900/70">Subtotal</dt>
					<dd class="text-right tabular-nums">
						{formatPrice(props.cart.subtotal, props.cart.currency)}
					</dd>
					<Show when={addDedication()}>
						<dt class="text-petal-900/70">Dedication card</dt>
						<dd class="text-right font-medium text-sage-600">Free</dd>
					</Show>
					<dt class="pt-2 text-base font-semibold">Total</dt>
					<dd class="pt-2 text-right text-base font-semibold tabular-nums">
						{formatPrice(props.cart.total, props.cart.currency)}
					</dd>
				</dl>

				<Show when={onHold()}>
					<p class="rounded-2xl bg-warning px-4 py-3 text-sm text-warning-foreground">
						{ON_HOLD_NOTICE}
					</p>
				</Show>

				<Show when={formError()}>
					<p
						role="alert"
						class="rounded-xl bg-error px-3 py-2 text-sm text-error-foreground"
					>
						{formError()}
					</p>
				</Show>

				<button
					type="submit"
					disabled={submitting() || hasProblem()}
					aria-busy={submitting()}
					class={pillPrimary}
				>
					{submitting()
						? "Placing your order…"
						: `Place order · ${formatPrice(props.cart.total, props.cart.currency)}`}
				</button>
			</aside>

			<Dialog.Root
				open={reviewing()}
				onOpenChange={(open) => !submitting() && setReviewing(open)}
			>
				<Dialog.Portal>
					<Dialog.Overlay class="fixed inset-0 z-50 bg-petal-900/40 backdrop-blur-sm" />
					<div class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
						<Dialog.Content class="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-petal-900 shadow-xl outline-none sm:rounded-3xl">
							<div class="overflow-y-auto p-6">
								<Dialog.Title class="font-display type-soft text-2xl font-semibold">
									Review your order
								</Dialog.Title>
								<Dialog.Description class="mt-1 text-sm text-petal-900/65">
									Check your notes and card message. You can still change them
									before placing the order.
								</Dialog.Description>

								<ReviewSummary
									form={formRef}
									cart={props.cart}
									paymentMethod={paymentMethod()}
									referenceLater={onHold()}
								/>
								<Show when={onHold()}>
									<div class="mt-3">
										<p class="rounded-2xl bg-warning px-4 py-3 text-sm text-warning-foreground">
											{ON_HOLD_NOTICE}
										</p>
									</div>
								</Show>

								<div class="mt-5 flex flex-col gap-4">
									<label class="flex flex-col gap-2">
										<span class="text-sm font-medium">
											Notes{" "}
											<span class="font-normal text-petal-900/50">
												(optional)
											</span>
										</span>
										<textarea
											value={notes()}
											onInput={(e) => {
												setNotes(e.currentTarget.value);
												clearError("notes");
											}}
											maxLength={NOTES_MAX}
											rows={2}
											placeholder="Anything we should know about your order"
											aria-invalid={errors().notes ? "true" : undefined}
											class={cn(reviewInput, "py-2")}
										/>
										<Show when={errors().notes}>
											<span class="text-xs text-destructive">
												{errors().notes}
											</span>
										</Show>
									</label>

									<Show
										when={addDedication()}
										fallback={
											<div class="flex items-center justify-between gap-3 rounded-2xl bg-petal-50 px-4 py-3 text-sm">
												<span class="text-petal-900/65">
													No dedication card.
												</span>
												<button
													type="button"
													onClick={() => chooseDedication(true)}
													class="font-medium text-petal-700 underline-offset-2 hover:underline"
												>
													Add a free card
												</button>
											</div>
										}
									>
										<div class="flex flex-col gap-3 rounded-2xl bg-petal-50 p-4">
											<div class="flex items-center justify-between">
												<span class="text-sm font-semibold">
													Dedication card{" "}
													<span class="font-medium text-sage-600">· Free</span>
												</span>
												<button
													type="button"
													onClick={() => chooseDedication(false)}
													class="text-xs text-petal-900/60 underline-offset-2 hover:underline"
												>
													Remove
												</button>
											</div>
											<label class="flex flex-col gap-1.5">
												<span class="text-sm font-medium">To</span>
												<input
													value={dedicationFor()}
													onInput={(e) => {
														setDedicationFor(e.currentTarget.value);
														clearError("dedicationFor");
													}}
													maxLength={NAME_MAX}
													placeholder="Who the card is addressed to"
													aria-invalid={
														errors().dedicationFor ? "true" : undefined
													}
													class={cn(reviewInput, "h-11")}
												/>
												<Show when={errors().dedicationFor}>
													<span class="text-xs text-destructive">
														{errors().dedicationFor}
													</span>
												</Show>
											</label>
											<label class="flex flex-col gap-1.5">
												<span class="flex justify-between text-sm font-medium">
													Message
													<span
														class="text-xs font-normal tabular-nums text-petal-900/50"
														aria-hidden="true"
													>
														{dedicationMessage().length}/
														{DEDICATION_MESSAGE_MAX}
													</span>
												</span>
												<textarea
													value={dedicationMessage()}
													onInput={(e) => {
														setDedicationMessage(e.currentTarget.value);
														clearError("dedicationMessage");
													}}
													maxLength={DEDICATION_MESSAGE_MAX}
													rows={5}
													aria-invalid={
														errors().dedicationMessage ? "true" : undefined
													}
													class={cn(
														reviewInput,
														"py-2 font-display text-base italic",
													)}
												/>
												<Show when={errors().dedicationMessage}>
													<span class="text-xs text-destructive">
														{errors().dedicationMessage}
													</span>
												</Show>
											</label>
										</div>
									</Show>
								</div>

								<Show when={formError()}>
									<p
										role="alert"
										class="mt-4 rounded-xl bg-error px-3 py-2 text-sm text-error-foreground"
									>
										{formError()}
									</p>
								</Show>
							</div>

							<div class="border-t border-petal-100 px-4 pt-4 text-center">
								<p class="text-xl font-extrabold tracking-wide text-error-foreground">
									NO CANCELLATION OF ORDERS
								</p>
								<label class="mx-auto mt-2 flex max-w-sm cursor-pointer items-start gap-3 py-1 text-left text-sm font-medium">
									<input
										type="checkbox"
										checked={noCancelAccepted()}
										onChange={(e) =>
											setNoCancelAccepted(e.currentTarget.checked)
										}
										class="mt-0.5 size-5 shrink-0 accent-petal-700"
									/>
									I understand that my order can’t be cancelled once it’s
									placed.
								</label>
							</div>
							<div class="flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end">
								<Dialog.CloseButton
									disabled={submitting()}
									class="h-12 rounded-full border border-petal-200 bg-white px-6 text-base font-medium transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									Back to checkout
								</Dialog.CloseButton>
								<button
									type="button"
									onClick={placeNow}
									disabled={submitting() || hasProblem() || !noCancelAccepted()}
									aria-busy={submitting()}
									class={cn(pillPrimary, "sm:w-auto sm:px-8")}
								>
									{submitting()
										? "Placing your order…"
										: `Place order · ${formatPrice(props.cart.total, props.cart.currency)}`}
								</button>
							</div>
						</Dialog.Content>
					</div>
				</Dialog.Portal>
			</Dialog.Root>
		</form>
	);
}

const reviewInput =
	"w-full rounded-xl border border-petal-200 bg-white px-3 text-base placeholder:text-petal-900/35 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 aria-[invalid=true]:border-destructive sm:text-sm";

/** The parts of the order that can't change in the review: who, what, how. */
function ReviewSummary(props: {
	form: HTMLFormElement;
	cart: PricedCart;
	paymentMethod: PaymentMethod | null;
	referenceLater: boolean;
}) {
	// Read once when the review opens; these fields stay on the form.
	const data = new FormData(props.form);
	const details = readCheckoutForm(data);
	const reference = data.get("referenceNumber");
	return (
		<dl class="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-2xl border border-petal-100 p-4 text-sm">
			<dt class="text-petal-900/60">Name</dt>
			<dd class="font-medium">
				{details.lastName}, {details.firstName}
			</dd>
			<dt class="text-petal-900/60">Class</dt>
			<dd>
				{CLASS_LABELS[details.className as keyof typeof CLASS_LABELS] ??
					details.className}
			</dd>
			<Show when={details.company}>
				<dt class="text-petal-900/60">Company</dt>
				<dd class="flex items-center gap-1.5">
					<ColorSwatch color={companyColor(details.company)} />
					{details.company}
				</dd>
			</Show>
			<dt class="text-petal-900/60">Bouquets</dt>
			<dd>
				{props.cart.lines
					.map((line) => `${line.quantity} × ${lineName(line)}`)
					.join(", ")}
			</dd>
			<Show when={props.paymentMethod}>
				{(method) => (
					<>
						<dt class="text-petal-900/60">Payment</dt>
						<dd>
							{PAYMENT_METHOD_LABELS[method()]}
							<Show
								when={!props.referenceLater}
								fallback=" · Reference number to follow"
							>
								<Show when={typeof reference === "string" && reference}>
									{" "}
									· Ref {String(reference)}
								</Show>
							</Show>
						</dd>
					</>
				)}
			</Show>
			<dt class="font-semibold">Total</dt>
			<dd class="font-semibold tabular-nums">
				{formatPrice(props.cart.total, props.cart.currency)}
			</dd>
		</dl>
	);
}

function Section(props: {
	title: string;
	step: number;
	children: JSX.Element;
}) {
	return (
		<section class="rounded-3xl border border-petal-100 bg-white p-6">
			<h2 class="mb-4 flex items-center gap-3 font-display type-soft text-xl font-semibold">
				<span
					aria-hidden="true"
					class="flex size-7 items-center justify-center rounded-full bg-petal-100 font-sans text-sm text-petal-700"
				>
					{props.step}
				</span>
				{props.title}
			</h2>
			{props.children}
		</section>
	);
}

function Field(props: {
	name: CheckoutField;
	label: string;
	autocomplete?: string;
	placeholder?: string;
	description?: string;
	maxLength?: number;
	error?: string;
	class?: string;
	defaultValue?: string;
	/** Controlled value; leave unset for an uncontrolled field. */
	value?: string;
	onValueChange?: (value: string) => void;
	onInput: () => void;
}) {
	return (
		<TextField
			name={props.name}
			defaultValue={props.defaultValue}
			value={props.value}
			onChange={props.onValueChange}
			validationState={props.error ? "invalid" : "valid"}
			class={cn("gap-2", props.class)}
		>
			<TextFieldLabel class="text-petal-900">{props.label}</TextFieldLabel>
			<TextFieldInput
				type="text"
				autocomplete={props.autocomplete}
				placeholder={props.placeholder}
				maxLength={props.maxLength}
				onInput={props.onInput}
				class="h-11 rounded-xl border-petal-200 bg-white text-base placeholder:text-petal-900/35 focus-visible:ring-petal-500 sm:text-sm"
			/>
			<Show when={props.description && !props.error}>
				<TextFieldDescription class="text-xs text-petal-900/55">
					{props.description}
				</TextFieldDescription>
			</Show>
			<TextFieldErrorMessage>{props.error}</TextFieldErrorMessage>
		</TextField>
	);
}

function EmptyCheckout() {
	return (
		<div class="mx-auto mt-12 flex max-w-md flex-col items-center gap-4 rounded-3xl bg-white px-6 py-12 text-center">
			<FlowerMark class="size-14" />
			<p class="font-display type-soft text-2xl font-semibold">
				Your bag is empty
			</p>
			<p class="text-petal-900/65">
				Add a bouquet first, then come back to send it on its way.
			</p>
			<Link to="/shop" class={`${pillPrimary} w-auto`}>
				Shop bouquets
			</Link>
		</div>
	);
}

/** Drops keys whose validator returned no message. */
function withoutEmpty(errors: FieldErrors): FieldErrors {
	return Object.fromEntries(
		Object.entries(errors).filter(([, message]) => message),
	) as FieldErrors;
}
