import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import type { JSX } from "solid-js";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";

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
import { cartStore, clearCart, setCartOpen } from "~/lib/cart-store";
import {
	type CheckoutField,
	DELIVERY_SLOTS,
	type DeliverySlot,
	type FieldErrors,
	formatSlot,
	GIFT_MESSAGE_MAX,
	getDeliveryDays,
	hasErrors,
	isSlotOpen,
	type PaymentField,
	readCheckoutForm,
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
import type { PricedCart } from "~/lib/pricing";
import { formatPrice } from "~/lib/product";
import { formatDate, shopNow } from "~/lib/time";
import { usePricedCart, useSessionUser } from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import { listMyAddresses } from "~/server/account";
import { getCheckoutConfig, placeOrder } from "~/server/orders";
import type { SavedAddress } from "~/types/account";
import type { PaymentAccount } from "~/types/payment";

export const Route = createFileRoute("/checkout")({
	loader: async ({ context }) => {
		const [config, savedAddresses] = await Promise.all([
			getCheckoutConfig(),
			context.user ? listMyAddresses() : Promise.resolve([]),
		]);
		return { ...config, savedAddresses };
	},
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
								Have an account?{" "}
								<Link
									to="/sign-in"
									search={{ redirect: "/checkout" }}
									class="font-medium text-petal-700 underline underline-offset-2"
								>
									Sign in
								</Link>{" "}
								to use saved addresses and track this order.
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
							savedAddresses={config().savedAddresses}
							email={user()?.email}
						/>
					</Match>
				</Switch>
			</main>
			<SiteFooter />
		</div>
	);
}

const chip =
	"flex h-full flex-col items-center rounded-2xl border border-petal-200 bg-white px-2 py-3 text-center transition-colors hover:border-petal-300 peer-checked:border-petal-700 peer-checked:bg-petal-50 peer-checked:shadow-[inset_0_0_0_1px] peer-checked:shadow-petal-700 peer-focus-visible:ring-2 peer-focus-visible:ring-petal-500 peer-focus-visible:ring-offset-2";

function CheckoutForm(props: {
	cart: PricedCart;
	paymentAccounts: PaymentAccount[];
	savedAddresses: SavedAddress[];
	/** Signed-in shopper's email, used to prefill the contact field. */
	email?: string;
}) {
	// Controlled so picking a saved address can fill them in.
	const fromAddress = (address?: SavedAddress) => ({
		recipientName: address?.recipientName ?? "",
		address: address?.address ?? "",
		city: address?.city ?? "",
		postalCode: address?.postalCode ?? "",
	});
	const [recipient, setRecipient] = createStore(
		fromAddress(props.savedAddresses.find((a) => a.isDefault)),
	);
	const isPicked = (address: SavedAddress) =>
		recipient.recipientName === address.recipientName &&
		recipient.address === address.address &&
		recipient.city === address.city &&
		recipient.postalCode === address.postalCode;
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

	// Rendered client-side only (after the bag loads), so the clock can't
	// differ between server and browser markup.
	const clock = shopNow();
	const deliveryDays = getDeliveryDays(clock);
	const [deliveryDate, setDeliveryDate] = createSignal(
		deliveryDays[0]?.date ?? clock.date,
	);
	const slotOpen = (slot: DeliverySlot) =>
		isSlotOpen(slot, deliveryDate(), clock);
	const firstOpenSlot = () => DELIVERY_SLOTS.find(slotOpen)?.id ?? "";
	const [deliverySlot, setDeliverySlot] = createSignal(firstOpenSlot());
	const chooseDay = (date: string) => {
		setDeliveryDate(date);
		clearError("deliveryDate");
		const current = DELIVERY_SLOTS.find((slot) => slot.id === deliverySlot());
		if (!current || !slotOpen(current)) setDeliverySlot(firstOpenSlot());
	};
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
			...validateCheckoutDetails(details, shopNow()),
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
							defaultValue={props.email}
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
					<Show when={props.savedAddresses.length > 0}>
						<fieldset class="mb-4">
							<legend class="mb-2 text-sm font-medium">
								Use a saved address
							</legend>
							<div class="flex flex-wrap gap-2">
								<For each={props.savedAddresses}>
									{(address) => (
										<button
											type="button"
											aria-pressed={isPicked(address)}
											onClick={() => {
												setRecipient(fromAddress(address));
												for (const field of [
													"recipientName",
													"address",
													"city",
													"postalCode",
												] as const)
													clearError(field);
											}}
											class={cn(
												"rounded-full border px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-petal-500",
												isPicked(address)
													? "border-petal-700 bg-petal-50 font-medium"
													: "border-petal-200 bg-white hover:bg-petal-50",
											)}
										>
											{address.label}
											<span class="text-petal-900/55">
												{" "}
												· {address.recipientName}
											</span>
										</button>
									)}
								</For>
							</div>
						</fieldset>
					</Show>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field
							name="recipientName"
							label="Recipient’s name"
							autocomplete="shipping name"
							class="sm:col-span-2"
							value={recipient.recipientName}
							onValueChange={(value) => setRecipient("recipientName", value)}
							error={errors().recipientName}
							onInput={() => clearError("recipientName")}
						/>
						<Field
							name="address"
							label="Street address"
							autocomplete="shipping street-address"
							placeholder="House number, street, apartment"
							class="sm:col-span-2"
							value={recipient.address}
							onValueChange={(value) => setRecipient("address", value)}
							error={errors().address}
							onInput={() => clearError("address")}
						/>
						<Field
							name="city"
							label="City"
							autocomplete="shipping address-level2"
							value={recipient.city}
							onValueChange={(value) => setRecipient("city", value)}
							error={errors().city}
							onInput={() => clearError("city")}
						/>
						<Field
							name="postalCode"
							label="Postal code"
							autocomplete="shipping postal-code"
							value={recipient.postalCode}
							onValueChange={(value) => setRecipient("postalCode", value)}
							error={errors().postalCode}
							onInput={() => clearError("postalCode")}
						/>
					</div>
				</Section>

				<Section title="Delivery day & time" step={3}>
					<fieldset aria-describedby="delivery-hint delivery-error">
						<legend class="sr-only">Choose a delivery day</legend>
						<p id="delivery-hint" class="mb-3 text-sm text-petal-900/65">
							{deliveryDays[0]?.offset === 0
								? "Order before 2pm for free same-day delivery."
								: "Same-day delivery closes at 2pm, so the earliest is tomorrow."}
						</p>
						<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
							<For each={deliveryDays}>
								{(day) => (
									<label class="cursor-pointer">
										<input
											type="radio"
											name="deliveryDate"
											value={day.date}
											checked={deliveryDate() === day.date}
											aria-invalid={errors().deliveryDate ? "true" : undefined}
											onChange={() => chooseDay(day.date)}
											class="peer sr-only"
										/>
										<span class={chip}>
											<span class="text-[11px] font-medium uppercase tracking-wide text-petal-900/60">
												{day.offset === 0
													? "Today"
													: day.offset === 1
														? "Tomorrow"
														: formatDate(day.date, { weekday: "short" })}
											</span>
											<span class="font-display type-soft text-lg font-semibold">
												{formatDate(day.date, { day: "numeric" })}
											</span>
											<span class="text-xs text-petal-900/60">
												{formatDate(day.date, { month: "short" })}
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

					<fieldset class="mt-5" aria-describedby="slot-error">
						<legend class="mb-3 text-sm font-medium">Delivery time</legend>
						<div class="grid gap-2 sm:grid-cols-3">
							<For each={DELIVERY_SLOTS}>
								{(slot) => (
									<label
										class={cn(
											"cursor-pointer",
											!slotOpen(slot) && "cursor-not-allowed",
										)}
									>
										<input
											type="radio"
											name="deliverySlot"
											value={slot.id}
											checked={deliverySlot() === slot.id}
											disabled={!slotOpen(slot)}
											aria-invalid={errors().deliverySlot ? "true" : undefined}
											onChange={() => {
												setDeliverySlot(slot.id);
												clearError("deliverySlot");
											}}
											class="peer sr-only"
										/>
										<span
											class={cn(
												chip,
												"py-2.5 peer-disabled:border-dashed peer-disabled:bg-transparent peer-disabled:opacity-50",
											)}
										>
											<span class="text-sm font-medium">
												{formatSlot(slot)}
											</span>
											<span class="text-xs text-petal-900/60">
												{slotOpen(slot) ? "Available" : "Closed for today"}
											</span>
										</span>
									</label>
								)}
							</For>
						</div>
						<Show when={errors().deliverySlot}>
							<p id="slot-error" class="mt-2 text-xs text-destructive">
								{errors().deliverySlot}
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
						accounts={props.paymentAccounts}
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
	/** Controlled value; leave unset for an uncontrolled field. */
	value?: string;
	onValueChange?: (value: string) => void;
	defaultValue?: string;
	onInput: () => void;
}) {
	return (
		<TextField
			name={props.name}
			value={props.value}
			onChange={props.onValueChange}
			defaultValue={props.defaultValue}
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
