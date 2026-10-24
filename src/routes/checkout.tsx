import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import type { JSX } from "solid-js";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";

import { pillPrimary } from "~/components/cart/cart-sheet";
import { PaymentSection } from "~/components/checkout/payment-section";
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
import { products } from "~/data/products";
import { cartStore, clearCart, setCartOpen } from "~/lib/cart-store";
import {
	type CheckoutField,
	type FieldErrors,
	formatDeliveryDate,
	GIFT_MESSAGE_MAX,
	getDeliveryDays,
	hasErrors,
	type PaymentField,
	readCheckoutForm,
	SAME_DAY_CUTOFF_HOUR,
	toISODate,
	validateCheckoutDetails,
} from "~/lib/checkout";
import {
	type CardInput,
	cardDigits,
	detectCardBrand,
	isQrPayment,
	type PaymentMethod,
	validateCard,
	validateProofFile,
	validateReferenceNumber,
} from "~/lib/payment";
import { type PricedCart, priceCart } from "~/lib/pricing";
import { formatPrice } from "~/lib/product";
import { cn } from "~/lib/utils";
import { placeOrder } from "~/server/orders";

export const Route = createFileRoute("/checkout")({
	head: () => ({ meta: [{ title: "Checkout · ORAIA" }] }),
	component: CheckoutPage,
});

function CheckoutPage() {
	const cartState = useSelector(cartStore);
	const cart = createMemo(() => priceCart(cartState().lines));

	return (
		<div class="flex min-h-screen flex-col bg-cream text-petal-900">
			<SiteHeader />
			<main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6 lg:px-8">
				<h1 class="font-display type-soft text-4xl font-semibold tracking-tight">
					Checkout
				</h1>
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
						<CheckoutForm cart={cart()} />
					</Match>
				</Switch>
			</main>
			<SiteFooter />
		</div>
	);
}

function CheckoutForm(props: { cart: PricedCart }) {
	const navigate = useNavigate();
	const [errors, setErrors] = createSignal<FieldErrors>({});
	const [formError, setFormError] = createSignal<string | null>(null);
	const [submitting, setSubmitting] = createSignal(false);
	const [giftLength, setGiftLength] = createSignal(0);
	const [paymentMethod, setPaymentMethod] = createSignal<PaymentMethod | null>(
		null,
	);
	const [card, setCard] = createSignal<CardInput>({
		number: "",
		name: "",
		expiry: "",
		cvc: "",
	});
	const [proof, setProof] = createSignal<File | null>(null);

	const now = new Date();
	const deliveryDays = getDeliveryDays(now);
	const sameDayClosed = now.getHours() >= SAME_DAY_CUTOFF_HOUR;
	const hasProblem = () => props.cart.lines.some((line) => line.problem);

	const clearError = (field: CheckoutField | PaymentField) => {
		if (!errors()[field]) return;
		setErrors(({ [field]: _, ...rest }) => rest);
	};

	const focusFirstInvalid = (form: HTMLFormElement) =>
		requestAnimationFrame(() =>
			form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
		);

	const validatePayment = (form: FormData): FieldErrors => {
		const method = paymentMethod();
		if (!method) return { paymentMethod: "Choose how you’d like to pay." };
		if (isQrPayment(method)) {
			const reference = form.get("referenceNumber");
			return {
				referenceNumber: validateReferenceNumber(
					typeof reference === "string" ? reference : "",
				),
				paymentProof: validateProofFile(proof()),
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

	const handleSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (submitting() || hasProblem()) return;
		const form = event.currentTarget as HTMLFormElement;
		const formData = new FormData(form);
		const details = readCheckoutForm(formData);
		const fieldErrors = withoutEmpty({
			...validateCheckoutDetails(details, toISODate(new Date())),
			...validatePayment(formData),
		});
		setErrors(fieldErrors);
		setFormError(null);
		if (hasErrors(fieldErrors)) {
			focusFirstInvalid(form);
			return;
		}

		setSubmitting(true);
		try {
			// Build the request from an allowlist rather than the raw form: UI
			// libraries may name inputs on their own, and the full card number,
			// expiry and CVC must never leave the browser.
			const payload = new FormData();
			for (const [field, value] of Object.entries(details)) {
				payload.set(field, value);
			}
			payload.set("lines", JSON.stringify(cartStore.state.lines));
			const method = paymentMethod() as PaymentMethod;
			payload.set("paymentMethod", method);
			const screenshot = proof();
			if (isQrPayment(method) && screenshot) {
				const reference = formData.get("referenceNumber");
				payload.set(
					"referenceNumber",
					typeof reference === "string" ? reference : "",
				);
				payload.set("paymentProof", screenshot);
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
					focusFirstInvalid(form);
				}
				return;
			}
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
			noValidate
			onSubmit={handleSubmit}
			class="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]"
		>
			<div class="flex flex-col gap-6">
				<Section title="Contact" step={1}>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field
							name="email"
							label="Email"
							type="email"
							autocomplete="email"
							placeholder="you@example.com"
							error={errors().email}
							onInput={() => clearError("email")}
						/>
						<Field
							name="phone"
							label="Mobile number"
							type="tel"
							autocomplete="tel"
							placeholder="0917 123 4567"
							description="For delivery and payment updates."
							error={errors().phone}
							onInput={() => clearError("phone")}
						/>
					</div>
				</Section>

				<Section title="Who are they for?" step={2}>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field
							name="recipientName"
							label="Recipient’s name"
							autocomplete="shipping name"
							class="sm:col-span-2"
							error={errors().recipientName}
							onInput={() => clearError("recipientName")}
						/>
						<Field
							name="address"
							label="Street address"
							autocomplete="shipping street-address"
							placeholder="House number, street, apartment"
							class="sm:col-span-2"
							error={errors().address}
							onInput={() => clearError("address")}
						/>
						<Field
							name="city"
							label="City"
							autocomplete="shipping address-level2"
							error={errors().city}
							onInput={() => clearError("city")}
						/>
						<Field
							name="postalCode"
							label="Postal code"
							autocomplete="shipping postal-code"
							error={errors().postalCode}
							onInput={() => clearError("postalCode")}
						/>
					</div>
				</Section>

				<Section title="Delivery day" step={3}>
					<fieldset aria-describedby="delivery-hint delivery-error">
						<legend class="sr-only">Choose a delivery day</legend>
						<p id="delivery-hint" class="mb-3 text-sm text-petal-900/65">
							{sameDayClosed
								? "Same-day delivery closes at 2pm, so the earliest is tomorrow."
								: "Order before 2pm for free same-day delivery."}
						</p>
						<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
							<For each={deliveryDays}>
								{(day, index) => (
									<label class="cursor-pointer">
										<input
											type="radio"
											name="deliveryDate"
											value={day.date}
											checked={index() === 0}
											aria-invalid={errors().deliveryDate ? "true" : undefined}
											onChange={() => clearError("deliveryDate")}
											class="peer sr-only"
										/>
										<span class="flex h-full flex-col items-center rounded-2xl border border-petal-200 bg-white px-2 py-3 text-center transition-colors hover:border-petal-300 peer-checked:border-petal-700 peer-checked:bg-petal-50 peer-checked:shadow-[inset_0_0_0_1px] peer-checked:shadow-petal-700 peer-focus-visible:ring-2 peer-focus-visible:ring-petal-500 peer-focus-visible:ring-offset-2">
											<span class="text-[11px] font-medium uppercase tracking-wide text-petal-900/60">
												{day.offset === 0
													? "Today"
													: day.offset === 1
														? "Tomorrow"
														: formatDeliveryDate(day.date, {
																weekday: "short",
															})}
											</span>
											<span class="font-display type-soft text-lg font-semibold">
												{formatDeliveryDate(day.date, { day: "numeric" })}
											</span>
											<span class="text-xs text-petal-900/60">
												{formatDeliveryDate(day.date, { month: "short" })}
											</span>
										</span>
									</label>
								)}
							</For>
						</div>
						<Show when={errors().deliveryDate}>
							<p id="delivery-error" class="mt-2 text-xs text-destructive">
								{errors().deliveryDate}
							</p>
						</Show>
					</fieldset>
				</Section>

				<Section title="Add a little note" step={4}>
					<TextField
						name="giftMessage"
						validationState={errors().giftMessage ? "invalid" : "valid"}
						class="gap-2"
					>
						<TextFieldLabel class="text-petal-900">
							Card message{" "}
							<span class="font-normal text-petal-900/50">(optional)</span>
						</TextFieldLabel>
						<TextFieldTextArea
							maxLength={GIFT_MESSAGE_MAX}
							rows={3}
							placeholder="Happy birthday, sunshine! 🌷"
							onInput={(event: InputEvent) => {
								setGiftLength(
									(event.currentTarget as HTMLTextAreaElement).value.length,
								);
								clearError("giftMessage");
							}}
							class="rounded-xl border-petal-200 bg-white text-base focus-visible:ring-petal-500 sm:text-sm"
						/>
						<div class="flex justify-between gap-4">
							<TextFieldDescription class="text-petal-900/60">
								Handwritten on a card tucked into the bouquet.
							</TextFieldDescription>
							<span
								class="shrink-0 text-xs tabular-nums text-petal-900/50"
								aria-hidden="true"
							>
								{giftLength()}/{GIFT_MESSAGE_MAX}
							</span>
						</div>
						<TextFieldErrorMessage>
							{errors().giftMessage}
						</TextFieldErrorMessage>
					</TextField>
				</Section>

				<Section title="Payment" step={5}>
					<PaymentSection
						total={props.cart.total}
						currency={props.cart.currency}
						method={paymentMethod()}
						onMethodChange={setPaymentMethod}
						card={card()}
						onCardChange={(patch) =>
							setCard((current) => ({ ...current, ...patch }))
						}
						proof={proof()}
						onProofChange={setProof}
						errors={errors()}
						clearError={clearError}
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
						class="rounded-full px-2 py-1 text-sm text-petal-700 underline-offset-4 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
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
										{line.colorName}
									</span>
									<Show when={line.problem}>
										<span class="block text-sm text-error-foreground">
											{line.problem === "sold-out"
												? "Sold out — remove to continue"
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
					<dt class="text-petal-900/70">Delivery</dt>
					<dd class="text-right font-medium text-sage-600">Free</dd>
					<dt class="pt-2 text-base font-semibold">Total</dt>
					<dd class="pt-2 text-right text-base font-semibold tabular-nums">
						{formatPrice(props.cart.total, props.cart.currency)}
					</dd>
				</dl>

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
		</form>
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
	type?: "text" | "email" | "tel";
	autocomplete?: string;
	placeholder?: string;
	description?: string;
	optional?: boolean;
	error?: string;
	class?: string;
	onInput: () => void;
}) {
	return (
		<TextField
			name={props.name}
			validationState={props.error ? "invalid" : "valid"}
			class={cn("gap-2", props.class)}
		>
			<TextFieldLabel class="text-petal-900">
				{props.label}
				<Show when={props.optional}>
					{" "}
					<span class="font-normal text-petal-900/50">(optional)</span>
				</Show>
			</TextFieldLabel>
			<TextFieldInput
				type={props.type ?? "text"}
				autocomplete={props.autocomplete}
				placeholder={props.placeholder}
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
	const featured = products[0];
	return (
		<div class="mx-auto mt-12 flex max-w-md flex-col items-center gap-4 rounded-3xl bg-white px-6 py-12 text-center">
			<FlowerMark class="size-14" />
			<p class="font-display type-soft text-2xl font-semibold">
				Your bag is empty
			</p>
			<p class="text-petal-900/65">
				Add a bouquet first, then come back to send it on its way.
			</p>
			<Show when={featured}>
				{(product) => (
					<Link
						to="/products/$productId"
						params={{ productId: product().id }}
						class={`${pillPrimary} w-auto`}
					>
						Shop bouquets
					</Link>
				)}
			</Show>
		</div>
	);
}

/** Drops keys whose validator returned no message. */
function withoutEmpty(errors: FieldErrors): FieldErrors {
	return Object.fromEntries(
		Object.entries(errors).filter(([, message]) => message),
	) as FieldErrors;
}
