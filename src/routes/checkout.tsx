import * as Dialog from "@kobalte/core/dialog";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { useSelector } from "@tanstack/solid-store";
import type { JSX } from "solid-js";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	For,
	Match,
	on,
	onCleanup,
	Show,
	Switch,
} from "solid-js";
import { createStore } from "solid-js/store";

import { pillPrimary } from "~/components/cart/cart-sheet";
import {
	type BagBouquet,
	BouquetMessages,
	bagBouquets,
	bouquetPanelId,
} from "~/components/checkout/bouquet-messages";
import { ChoiceSelect } from "~/components/checkout/choice-select";
import { PaymentNotice } from "~/components/checkout/payment-notice";
import { PaymentSection } from "~/components/checkout/payment-section";
import { ColorSwatch } from "~/components/order/company-label";
import { PreorderTag } from "~/components/product/preorder-tag";
import {
	LinePrice,
	SaleRows,
	subtotalBeforeSale,
} from "~/components/shop/sale-price";
import { FlowerMark } from "~/components/site/brand";
import { SiteFooter } from "~/components/site/site-footer";
import { SiteHeader } from "~/components/site/site-header";
import {
	InputGroup,
	InputGroupAddon,
	inputGroupControl,
} from "~/components/ui/input-group";
import {
	TextField,
	TextFieldDescription,
	TextFieldErrorMessage,
	TextFieldInput,
	TextFieldLabel,
} from "~/components/ui/text-field";
import {
	type BouquetMessage,
	type BouquetMessageErrors,
	EMPTY_MESSAGE,
	hasCard,
	hasContent,
	lineKey,
	parseBouquetMessage,
	validateBouquetMessage,
} from "~/lib/bouquet-messages";
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
	EMAIL_MAX,
	type FieldErrors,
	formatSerialNumber,
	hasErrors,
	NAME_MAX,
	type PaymentField,
	readCheckoutForm,
	SERIAL_NUMBER_MAX,
	serialDigits,
	validateCheckoutDetails,
} from "~/lib/checkout";
import {
	clearCheckoutDraft,
	readCheckoutDraft,
	writeCheckoutDraft,
} from "~/lib/checkout-draft";
import { ORDER_EDIT_HOURS } from "~/lib/order-edit";
import { promoSubtotal } from "~/lib/order-promo";
import {
	type CardInput,
	cardDigits,
	detectCardBrand,
	isMethodAllowedFor,
	isQrPayment,
	ON_HOLD_NOTICE,
	PAYMENT_METHOD_LABELS,
	type PaymentMethod,
	validateCard,
	validateReferenceNumber,
} from "~/lib/payment";
import { priceCart, roundMoney } from "~/lib/pricing";
import {
	formatPrice,
	formatReadyDate,
	lineName,
	styleLabel,
} from "~/lib/product";
import { allowsMethod, PAYMENT_METHOD_SHORT } from "~/lib/sale";
import {
	useCatalog,
	useCustomSettings,
	usePricedCart,
	useSales,
	useSessionUser,
} from "~/lib/use-catalog";
import { cn } from "~/lib/utils";
import {
	getCheckoutConfig,
	getPromoProgress,
	placeOrder,
} from "~/server/orders";
import type { PaymentAccount } from "~/types/payment";

export const Route = createFileRoute("/checkout")({
	loader: () => getCheckoutConfig(),
	head: () => ({ meta: [{ title: "Checkout · ORAIA" }] }),
	component: CheckoutPage,
});

const DETAILS_SECTION = "checkout-details";
const PAYMENT_SECTION = "checkout-payment";

function CheckoutPage() {
	/** The order went through: the bag is empty, on the way to the order page. */
	const [placed, setPlaced] = createSignal(false);
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
						when={!user()?.isStaff && user()}
						fallback={
							<Show
								when={!user()?.isStaff}
								fallback={
									<p class="text-sm text-petal-900/65">
										You’re signed in as staff, so this order won’t go on your
										account.
									</p>
								}
							>
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
							</Show>
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
					<Match when={placed()}>
						<output class="mx-auto mt-12 block max-w-md rounded-3xl bg-white px-6 py-12 text-center text-petal-900/70">
							Your order is placed. Taking you to it…
						</output>
					</Match>
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
							paymentAccounts={config().paymentAccounts}
							name={user()?.isStaff ? undefined : user()?.name}
							email={user()?.isStaff ? undefined : user()?.email}
							onPlaced={() => setPlaced(true)}
						/>
					</Match>
				</Switch>
			</main>
			<SiteFooter />
		</div>
	);
}

function CheckoutForm(props: {
	paymentAccounts: PaymentAccount[];
	/** Signed-in shopper's name, used to prefill the name field. */
	name?: string;
	/** And their email, for the email field. */
	email?: string;
	onPlaced: () => void;
}) {
	const [paymentMethod, setPaymentMethod] = createSignal<PaymentMethod | null>(
		null,
	);
	const catalog = useCatalog();
	const custom = useCustomSettings();
	const sales = useSales();
	const bagLines = useSelector(cartStore, (state) => state.lines);
	/**
	 * The bag priced for the payment method chosen: a sale for some methods
	 * only (e.g. GCash) applies once that method is picked. The server prices
	 * it the same way.
	 */
	const cart = createMemo(() =>
		priceCart(bagLines(), catalog(), custom(), sales(), paymentMethod()),
	);
	const navigate = useNavigate();
	const [errors, setErrors] = createSignal<FieldErrors>({});
	const [formError, setFormError] = createSignal<string | null>(null);
	const [submitting, setSubmitting] = createSignal(false);
	// What was typed before a reload or a look back at the shop.
	const draft = readCheckoutDraft();
	const [className, setClassName] = createSignal(draft?.className ?? "");
	const [company, setCompany] = createSignal(draft?.company ?? "");
	const [serialNumber, setSerialNumber] = createSignal(
		draft?.serialNumber ?? "",
	);
	/** The serial number once they stop typing, so each key isn't looked up. */
	const [settledSerial, setSettledSerial] = createSignal("");
	createEffect(() => {
		const serial = className() === CIVILIAN ? "" : serialNumber();
		const timer = setTimeout(() => setSettledSerial(serial), 350);
		onCleanup(() => clearTimeout(timer));
	});
	// Cadets' order promos (e.g. ₱500 off every 10th order), by serial number.
	const [promoLookup] = createResource(settledSerial, (serial) =>
		getPromoProgress({ data: { serialNumber: serial } }),
	);
	/** What the promos say for the serial number typed now, once looked up. */
	const promoProgress = () =>
		(promoLookup.state === "ready" || promoLookup.state === "refreshing") &&
		settledSerial() === serialNumber() &&
		className() !== CIVILIAN
			? promoLookup.latest
			: undefined;
	/** Pesos off this order; checkout works it out again on the server. */
	/** What the bag's bouquets on the promo (all, or its chosen ones) come to. */
	const onPromo = () => {
		const reward = promoProgress()?.reward;
		return reward ? promoSubtotal(reward, cart().lines) : 0;
	};
	const promoDiscount = () => {
		const reward = promoProgress()?.reward;
		return reward &&
			allowsMethod(reward, paymentMethod()) &&
			onPromo() > 0 &&
			onPromo() > reward.minSpend
			? Math.min(reward.amount, onPromo())
			: 0;
	};
	/** Pesos more of the promo's bouquets this order needs for its reward, if short. */
	const promoShortBy = () => {
		const reward = promoProgress()?.reward;
		if (
			!reward ||
			promoDiscount() > 0 ||
			!allowsMethod(reward, paymentMethod())
		)
			return 0;
		return Math.floor(reward.minSpend - onPromo()) + 1;
	};
	const orderTotal = () => roundMoney(cart().total - promoDiscount());
	/**
	 * A cheaper way to pay, when a sale or this order's promo is for payment
	 * methods the shopper hasn't picked: "Pay with GCash and save ₱150".
	 */
	const methodTip = () => {
		const current = orderTotal();
		const reward = promoProgress()?.reward;
		let best: { method: PaymentMethod; saves: number } | undefined;
		for (const account of paymentAccounts()) {
			const method = account.method;
			if (method === paymentMethod()) continue;
			const priced = priceCart(
				bagLines(),
				catalog(),
				custom(),
				sales(),
				method,
			);
			const onPromoThere = reward ? promoSubtotal(reward, priced.lines) : 0;
			const promoThere =
				reward && allowsMethod(reward, method) && onPromoThere > reward.minSpend
					? Math.min(reward.amount, onPromoThere)
					: 0;
			const saves = roundMoney(current - (priced.total - promoThere));
			if (saves > 0 && (!best || saves > best.saves)) best = { method, saves };
		}
		return best;
	};
	/** Each bouquet's card and note, by `unitKey`. */
	const [messages, setMessages] = createStore<Record<string, BouquetMessage>>(
		draft?.messages ?? {},
	);
	const saveDraft = () => {
		const form = new FormData(formRef);
		const field = (key: string) => {
			const value = form.get(key);
			return typeof value === "string" ? value : "";
		};
		writeCheckoutDraft({
			className: className(),
			company: company(),
			serialNumber: serialNumber(),
			lastName: field("lastName"),
			firstName: field("firstName"),
			email: field("email"),
			messages: JSON.parse(JSON.stringify(messages)),
		});
	};
	// After every change to the controlled fields and the cards; typing in the
	// name and email fields saves through the form's onInput.
	createEffect(
		on(
			[className, company, serialNumber, () => JSON.stringify(messages)],
			saveDraft,
			{ defer: true },
		),
	);
	const [bouquetErrors, setBouquetErrors] = createSignal<
		Record<string, BouquetMessageErrors>
	>({});
	const bouquets = createMemo(() => bagBouquets(cart().lines));
	const messageFor = (key: string) =>
		parseBouquetMessage(messages[key] ?? EMPTY_MESSAGE);
	/** A card is printed only when there's a message for it. */
	const cardCount = () =>
		bouquets().filter((bouquet) => hasCard(messageFor(bouquet.key))).length;
	const updateMessage = (key: string, patch: Partial<BouquetMessage>) =>
		setMessages(key, (current) => ({
			...(current ?? EMPTY_MESSAGE),
			...patch,
		}));
	const clearBouquetError = (key: string, field: keyof BouquetMessage) => {
		if (!bouquetErrors()[key]?.[field]) return;
		setBouquetErrors(({ [key]: current, ...rest }) => {
			const { [field]: _, ...left } = current ?? {};
			return Object.keys(left).length ? { ...rest, [key]: left } : rest;
		});
	};
	/** Checks every bouquet's card and note; returns what's wrong, by bouquet. */
	const validateMessages = () =>
		Object.fromEntries(
			bouquets()
				.map((bouquet) => [
					bouquet.key,
					validateBouquetMessage(messageFor(bouquet.key)),
				])
				.filter(([, problems]) => Object.keys(problems).length > 0),
		) as Record<string, BouquetMessageErrors>;
	/** What's sent with the order: each line's units, for lines with any. */
	const messagesPayload = () => {
		const byLine: Record<string, BouquetMessage[]> = {};
		for (const line of cart().lines) {
			const units = bouquets()
				.filter((bouquet) => bouquet.line === line)
				.map((bouquet) => messageFor(bouquet.key));
			if (units.some(hasContent)) byLine[lineKey(line)] = units;
		}
		return byLine;
	};
	/** From the review: back to a bouquet's panel to change its card or note. */
	const editBouquet = (key: string) => {
		setReviewing(false);
		requestAnimationFrame(() => {
			const panel = document.getElementById(bouquetPanelId(key));
			panel?.scrollIntoView({ behavior: "smooth", block: "start" });
			// The first field if a card or note is open, else the first "Add" button.
			(
				panel?.querySelector<HTMLElement>("input, textarea") ??
				panel?.querySelector<HTMLElement>("button")
			)?.focus({ preventScroll: true });
		});
	};
	/** From the review: back to the details or payment part of the form. */
	const editSection = (id: string) => {
		setReviewing(false);
		requestAnimationFrame(() => {
			const section = document.getElementById(id);
			section?.scrollIntoView({ behavior: "smooth", block: "start" });
			// The section itself, so no phone keyboard or dropdown pops open.
			section?.focus({ preventScroll: true });
		});
	};
	/** Open once the form is valid: a last look (and edit) before placing. */
	const [reviewing, setReviewing] = createSignal(false);
	/** Ticked in the review: orders can't be cancelled once placed. */
	const [noCancelAccepted, setNoCancelAccepted] = createSignal(false);
	/** They pressed Place order without ticking it: point at the box. */
	const [noCancelMissing, setNoCancelMissing] = createSignal(false);
	let noCancelBox: HTMLInputElement | undefined;
	/** "To follow": order now, send the reference number later. */
	const [referenceLater, setReferenceLater] = createSignal(false);
	let formRef!: HTMLFormElement;
	const [card, setCard] = createSignal<CardInput>({
		number: "",
		name: "",
		expiry: "",
		cvc: "",
	});
	const hasProblem = () => cart().lines.some((line) => line.problem);
	/**
	 * Cash always waits until it's handed over. QR payments can wait too; the
	 * choice is ignored if they switch to card.
	 */
	const onHold = () => {
		const method = paymentMethod();
		if (method === "cash") return true;
		return referenceLater() && !!method && isQrPayment(method);
	};
	/** Cash is for cadets only, so civilians don't see it. */
	const paymentAccounts = () =>
		props.paymentAccounts.filter((account) =>
			isMethodAllowedFor(account.method, className()),
		);
	// Switching to Civilian drops a cash choice they can no longer make.
	createEffect(() => {
		const method = paymentMethod();
		if (method && !isMethodAllowedFor(method, className()))
			setPaymentMethod(null);
	});
	/** Best guess from the account name: first word, then the rest. */
	const nameParts = () => {
		const [first = "", ...rest] = (props.name ?? "").trim().split(/\s+/);
		return { first, last: rest.join(" ") };
	};

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
		if (method === "cash") return {};
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
		const messageErrors = validateMessages();
		setErrors(fieldErrors);
		setBouquetErrors(messageErrors);
		setFormError(null);
		return hasErrors(fieldErrors) || Object.keys(messageErrors).length > 0
			? null
			: { formData, details };
	};

	// "Place order" on the form opens the review; nothing is saved yet.
	const handleSubmit = (event: SubmitEvent) => {
		event.preventDefault();
		if (submitting() || hasProblem()) return;
		if (validateForm()) {
			setNoCancelAccepted(false);
			setNoCancelMissing(false);
			setReviewing(true);
		} else focusFirstInvalid(formRef);
	};

	/** Places the order from the review dialog, with any edits made there. */
	const placeNow = async () => {
		if (submitting() || hasProblem()) return;
		if (!noCancelAccepted()) {
			setNoCancelMissing(true);
			noCancelBox?.focus();
			return;
		}
		const valid = validateForm();
		if (!valid) {
			setReviewing(false);
			focusFirstInvalid(formRef);
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
			payload.set("messages", JSON.stringify(messagesPayload()));
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
				if (result.fieldErrors || result.bouquetErrors) {
					setErrors(result.fieldErrors ?? {});
					setBouquetErrors(result.bouquetErrors ?? {});
					setReviewing(false);
					focusFirstInvalid(form);
				}
				return;
			}
			// Empty the bag the moment the order exists, so reloading or going back
			// can't order it twice. `onPlaced` keeps "empty" from flashing meanwhile.
			props.onPlaced();
			clearCart();
			clearCheckoutDraft();
			const orderPage = `/order/${result.orderId}`;
			// The order is placed even if this page change fails: never say otherwise.
			await navigate({
				to: "/order/$orderId",
				params: { orderId: result.orderId },
			}).catch(() => window.location.assign(orderPage));
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
			onInput={saveDraft}
			class="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]"
		>
			<div class="flex flex-col gap-6">
				<Section id={DETAILS_SECTION} title="Your details" step={1}>
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
								// Civilians don't have a company or a serial number.
								if (value === CIVILIAN) {
									setCompany("");
									setSerialNumber("");
								}
								clearError("className");
								clearError("company");
								clearError("serialNumber");
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
						<TextField
							name="serialNumber"
							value={serialNumber()}
							onChange={(value) => setSerialNumber(serialDigits(value))}
							disabled={className() === CIVILIAN}
							validationState={errors().serialNumber ? "invalid" : "valid"}
							class="gap-2"
						>
							<TextFieldLabel class="text-petal-900">
								Serial number
							</TextFieldLabel>
							<InputGroup>
								<TextFieldInput
									inputMode="numeric"
									autocomplete="off"
									maxLength={SERIAL_NUMBER_MAX}
									placeholder={
										className() === CIVILIAN
											? "Not needed for civilians"
											: "numbers"
									}
									onInput={() => clearError("serialNumber")}
									class={cn(inputGroupControl, "text-base sm:text-sm")}
								/>
								<InputGroupAddon>C-</InputGroupAddon>
							</InputGroup>
							<TextFieldErrorMessage>
								{errors().serialNumber}
							</TextFieldErrorMessage>
							<Show when={promoShortBy() > 0 && promoProgress()?.reward}>
								{(reward) => (
									<p class="rounded-lg bg-warning px-2.5 py-1.5 text-xs font-semibold text-warning-foreground">
										{reward().name}: this order can get{" "}
										{formatPrice(reward().amount, "PHP")} off if{" "}
										{reward().scope === "selected"
											? "the promo’s items in it"
											: "your bouquets"}{" "}
										come to more than {formatPrice(reward().minSpend, "PHP")}.
										Add {formatPrice(promoShortBy(), "PHP")} more
										{reward().scope === "selected" ? " of them" : ""} to get it.{" "}
										<Link to="/promos" class="underline underline-offset-2">
											See the promo
										</Link>
									</p>
								)}
							</Show>
							<Show when={promoDiscount() > 0 && promoProgress()?.reward}>
								{(reward) => (
									<p class="rounded-lg bg-success px-2.5 py-1.5 text-xs font-semibold text-success-foreground">
										🎉 {reward().name}: this order gets{" "}
										{formatPrice(reward().amount, "PHP")} off!
									</p>
								)}
							</Show>
							<Show when={!promoProgress()?.reward && promoProgress()?.next}>
								{(next) => (
									<p class="text-xs text-petal-900/65">
										{next().remaining === 1
											? "1 more order"
											: `${next().remaining} more orders`}{" "}
										and your next one gets {formatPrice(next().amount, "PHP")}{" "}
										off ({next().name}).{" "}
										<Link
											to="/promos"
											class="font-medium text-petal-700 underline underline-offset-2"
										>
											How it works
										</Link>
									</p>
								)}
							</Show>
						</TextField>
						<Field
							name="lastName"
							label="Last name"
							autocomplete="family-name"
							maxLength={NAME_MAX}
							defaultValue={draft?.lastName ?? nameParts().last}
							error={errors().lastName}
							onInput={() => clearError("lastName")}
						/>
						<Field
							name="firstName"
							label="First name"
							autocomplete="given-name"
							maxLength={NAME_MAX}
							defaultValue={draft?.firstName ?? nameParts().first}
							error={errors().firstName}
							onInput={() => clearError("firstName")}
						/>
						<Field
							name="email"
							label="Email"
							type="email"
							autocomplete="email"
							placeholder="you@example.com"
							// TODO: bring this back once order emails are sent; see TODO.md.
							// description="We’ll send your order details to this email."
							maxLength={EMAIL_MAX}
							defaultValue={draft?.email ?? props.email}
							error={errors().email}
							onInput={() => clearError("email")}
						/>
					</div>
				</Section>

				<Section
					title={bouquets().length > 1 ? "Cards & notes" : "Card & note"}
					note="Optional"
					step={2}
				>
					<BouquetMessages
						bouquets={bouquets()}
						messages={messages}
						onChange={updateMessage}
						errors={bouquetErrors()}
						clearError={clearBouquetError}
					/>
				</Section>

				<Section id={PAYMENT_SECTION} title="Payment" step={3}>
					<Show when={methodTip()}>
						{(tip) => (
							<p class="mb-4 rounded-2xl bg-success px-4 py-3 text-sm font-medium text-success-foreground">
								Pay with {PAYMENT_METHOD_SHORT[tip().method]} and save{" "}
								{formatPrice(tip().saves, cart().currency)}: a sale or promo is
								for {PAYMENT_METHOD_SHORT[tip().method]} payments.
							</p>
						)}
					</Show>
					<PaymentSection
						accounts={paymentAccounts()}
						total={orderTotal()}
						currency={cart().currency}
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
					<For each={cart().lines}>
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
									<Show when={line.preorder}>
										<PreorderTag readyBy={line.readyBy} class="mt-1" />
									</Show>
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
									<LinePrice line={line} currency={cart().currency} />
								</span>
							</li>
						)}
					</For>
				</ul>

				<Show when={cart().lines.filter((line) => line.preorder)}>
					{(preorders) => (
						<Show when={preorders().length > 0}>
							<div class="rounded-2xl border border-warning-foreground/25 bg-warning px-4 py-3 text-sm text-warning-foreground">
								<p class="font-semibold">
									{preorders().length === cart().lines.length
										? "This is a pre-order"
										: "Your order includes a pre-order"}
								</p>
								<ul class="mt-1 flex flex-col gap-0.5">
									<For each={preorders()}>
										{(line) => (
											<li>
												{lineName(line)}{" "}
												{line.readyBy ? (
													<>
														will be ready on{" "}
														<strong class="font-semibold">
															{formatReadyDate(line.readyBy)}
														</strong>
														.
													</>
												) : (
													"is made after you order. We’ll let you know when it’s ready."
												)}
											</li>
										)}
									</For>
								</ul>
							</div>
						</Show>
					)}
				</Show>

				<dl class="grid grid-cols-[1fr_auto] gap-y-1.5 border-t border-petal-100 pt-4 text-sm">
					<dt class="text-petal-900/70">Subtotal</dt>
					<dd class="text-right tabular-nums">
						{formatPrice(subtotalBeforeSale(cart()), cart().currency)}
					</dd>
					<SaleRows lines={cart().lines} currency={cart().currency} />
					<Show when={promoDiscount() > 0}>
						<dt class="text-sale">{promoProgress()?.reward?.name}</dt>
						<dd class="text-right font-medium tabular-nums text-sale">
							−{formatPrice(promoDiscount(), cart().currency)}
						</dd>
					</Show>
					<Show when={cardCount() > 0}>
						<dt class="text-petal-900/70">
							{cardCount() === 1
								? "Dedication card"
								: `Dedication cards (${cardCount()})`}
						</dt>
						<dd class="text-right font-medium text-sage-600">Free</dd>
					</Show>
					<dt class="pt-2 text-base font-semibold">Total</dt>
					<dd class="pt-2 text-right text-base font-semibold tabular-nums">
						{formatPrice(orderTotal(), cart().currency)}
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
						: `Place order · ${formatPrice(orderTotal(), cart().currency)}`}
				</button>
			</aside>

			<Dialog.Root
				open={reviewing()}
				onOpenChange={(open) => !submitting() && setReviewing(open)}
			>
				<Dialog.Portal>
					<Dialog.Overlay class="fixed inset-0 z-50 bg-petal-900/40 backdrop-blur-sm" />
					<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
						<Dialog.Content class="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-petal-900 shadow-xl outline-none sm:max-h-[90dvh] sm:rounded-3xl">
							<header class="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
								<div class="min-w-0">
									<Dialog.Title class="font-display type-soft text-xl font-semibold sm:text-2xl">
										Review your order
									</Dialog.Title>
									<Dialog.Description class="text-sm text-petal-900/65">
										One last look before you place it.
									</Dialog.Description>
								</div>
								<Dialog.CloseButton
									disabled={submitting()}
									aria-label="Back to checkout"
									class="-mr-1 flex size-10 shrink-0 items-center justify-center rounded-full text-xl text-petal-900/60 outline-none hover:bg-petal-50 focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									<span aria-hidden="true">×</span>
								</Dialog.CloseButton>
							</header>

							<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6">
								<ReviewBouquets
									bouquets={bouquets()}
									messageFor={messageFor}
									currency={cart().currency}
									total={orderTotal()}
									onEdit={editBouquet}
								/>
								<ReviewDetails
									form={formRef}
									paymentMethod={paymentMethod()}
									notice={
										paymentAccounts().find(
											(account) => account.method === paymentMethod(),
										)?.notice
									}
									referenceLater={onHold()}
									onEdit={editSection}
								/>
								<Show
									when={onHold()}
									fallback={
										<p class="mt-3 rounded-2xl bg-petal-50 px-4 py-3 text-sm">
											Your payment goes in with this order, so you won’t be able
											to edit it afterwards.
											<Show
												when={(() => {
													const method = paymentMethod();
													return !!method && isQrPayment(method);
												})()}
											>
												{" "}
												<button
													type="button"
													onClick={() => setReferenceLater(true)}
													class="font-medium text-petal-700 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
												>
													Pay later instead
												</button>{" "}
												to keep {ORDER_EDIT_HOURS} hours for changes.
											</Show>
										</p>
									}
								>
									<p class="mt-3 rounded-2xl bg-warning px-4 py-3 text-sm text-warning-foreground">
										We’ll hold your order until your payment arrives. You can
										edit it for {ORDER_EDIT_HOURS} hours, until you send your
										payment.
									</p>
								</Show>
								{/* Hints at more below the fold, under the pinned footer. */}
								<div
									aria-hidden="true"
									class="pointer-events-none sticky bottom-0 h-5 bg-linear-to-t from-white to-transparent"
								/>
							</div>

							<footer class="shrink-0 border-t border-petal-100 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
								<label
									class={cn(
										"flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm",
										noCancelMissing()
											? "border-error-foreground bg-error"
											: "border-petal-100",
									)}
								>
									<input
										ref={noCancelBox}
										type="checkbox"
										checked={noCancelAccepted()}
										aria-invalid={noCancelMissing() ? "true" : undefined}
										onChange={(e) => {
											setNoCancelAccepted(e.currentTarget.checked);
											setNoCancelMissing(false);
										}}
										class="mt-0.5 size-6 shrink-0 accent-petal-700"
									/>
									<span>
										<span class="block font-extrabold tracking-wide text-error-foreground">
											NO CANCELLATION OF ORDERS
										</span>
										I understand my order can’t be cancelled once it’s placed.
									</span>
								</label>
								<Show when={noCancelMissing()}>
									<p role="alert" class="mt-2 text-sm text-error-foreground">
										Tick the box above to place your order.
									</p>
								</Show>
								<Show when={formError()}>
									<p
										role="alert"
										class="mt-2 rounded-xl bg-error px-3 py-2 text-sm text-error-foreground"
									>
										{formError()}
									</p>
								</Show>
								<div class="mt-3 flex gap-2">
									<Dialog.CloseButton
										disabled={submitting()}
										class="hidden h-12 shrink-0 rounded-full border border-petal-200 bg-white px-6 text-base font-medium transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500 sm:block"
									>
										Back
									</Dialog.CloseButton>
									<button
										type="button"
										onClick={placeNow}
										disabled={submitting() || hasProblem()}
										aria-busy={submitting()}
										class={pillPrimary}
									>
										{submitting()
											? "Placing your order…"
											: `Place order · ${formatPrice(orderTotal(), cart().currency)}`}
									</button>
								</div>
							</footer>
						</Dialog.Content>
					</div>
				</Dialog.Portal>
			</Dialog.Root>
		</form>
	);
}

/** Every bouquet once, with its price, its card and note, and how to change them. */
function ReviewBouquets(props: {
	bouquets: BagBouquet[];
	messageFor: (key: string) => BouquetMessage;
	currency: string;
	total: number;
	onEdit: (key: string) => void;
}) {
	return (
		<section aria-labelledby="review-bouquets">
			<h3 id="review-bouquets" class="sr-only">
				Your bouquets
			</h3>
			<ul class="divide-y divide-petal-100 rounded-2xl border border-petal-100">
				<For each={props.bouquets}>
					{(bouquet) => {
						const message = () => props.messageFor(bouquet.key);
						const empty = () => !hasContent(message());
						return (
							<li class="flex items-start gap-3 p-3">
								<img
									src={bouquet.line.image}
									alt=""
									width={56}
									height={56}
									class="size-14 shrink-0 rounded-xl bg-petal-50 object-cover"
								/>
								<div class="min-w-0 flex-1 text-sm wrap-anywhere">
									<p class="flex justify-between gap-2">
										<span class="min-w-0 font-medium">
											{lineName(bouquet.line)}
											<Show when={bouquet.of > 1}>
												<span class="font-normal text-petal-900/60">
													{" "}
													· {bouquet.unit + 1} of {bouquet.of}
												</span>
											</Show>
										</span>
										<span class="shrink-0 font-medium tabular-nums">
											{formatPrice(bouquet.line.unitPrice, props.currency)}
										</span>
									</p>
									<Show when={bouquet.line.preorder}>
										<PreorderTag readyBy={bouquet.line.readyBy} class="mt-1" />
									</Show>
									<Show when={hasCard(message())}>
										<p class="mt-1.5 rounded-xl bg-petal-50 px-3 py-2">
											<Show when={message().to}>
												<span class="block text-xs font-medium">
													To: {message().to}
												</span>
											</Show>
											<span class="line-clamp-3 whitespace-pre-line font-display italic">
												“{message().message}”
											</span>
										</p>
									</Show>
									<Show when={message().note}>
										<p class="mt-1.5 line-clamp-2 whitespace-pre-line text-petal-900/75">
											<span class="font-medium text-petal-900">Note:</span>{" "}
											{message().note}
										</p>
									</Show>
									<button
										type="button"
										onClick={() => props.onEdit(bouquet.key)}
										class="-ml-1 mt-0.5 min-h-10 rounded-full px-1 text-sm font-medium text-petal-700 underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
									>
										{empty() ? "Add a card or note" : "Edit card or note"}
										<span class="sr-only"> for {lineName(bouquet.line)}</span>
									</button>
								</div>
							</li>
						);
					}}
				</For>
				<li class="flex items-baseline justify-between gap-3 p-3 font-semibold">
					<span>Total</span>
					<span class="text-lg tabular-nums">
						{formatPrice(props.total, props.currency)}
					</span>
				</li>
			</ul>
		</section>
	);
}

/** Who's ordering and how they're paying, a line each, with a way to change it. */
function ReviewDetails(props: {
	form: HTMLFormElement;
	paymentMethod: PaymentMethod | null;
	/** The chosen method's warning from Admin → Payments, if any. */
	notice?: string;
	referenceLater: boolean;
	onEdit: (sectionId: string) => void;
}) {
	// Read once when the review opens; these fields stay on the form.
	const data = new FormData(props.form);
	const details = readCheckoutForm(data);
	const reference = data.get("referenceNumber");
	return (
		<dl class="mt-3 divide-y divide-petal-100 rounded-2xl border border-petal-100 text-sm">
			<div class="flex items-start justify-between gap-3 p-3">
				<div class="min-w-0 wrap-anywhere">
					<dt class="text-xs text-petal-900/60">Ordered by</dt>
					<dd class="font-medium">
						{details.lastName}, {details.firstName}
					</dd>
					<dd class="flex flex-wrap items-center gap-x-1.5 text-petal-900/70">
						{CLASS_LABELS[details.className as keyof typeof CLASS_LABELS] ??
							details.className}
						<Show when={details.company}>
							<span aria-hidden="true">·</span>
							<ColorSwatch color={companyColor(details.company)} />
							{details.company}
						</Show>
						<Show when={details.serialNumber}>
							<span aria-hidden="true">·</span>
							<span class="tabular-nums">
								{formatSerialNumber(details.serialNumber)}
							</span>
						</Show>
					</dd>
				</div>
				<ReviewEdit
					label="your details"
					onClick={() => props.onEdit(DETAILS_SECTION)}
				/>
			</div>
			<div class="flex items-start justify-between gap-3 p-3">
				<div class="min-w-0 wrap-anywhere">
					<dt class="text-xs text-petal-900/60">Payment</dt>
					<dd class="font-medium">
						<Show when={props.paymentMethod}>
							{(method) => PAYMENT_METHOD_LABELS[method()]}
						</Show>
					</dd>
					<Show when={props.notice}>
						{(notice) => (
							<dd class="mt-1.5">
								<PaymentNotice text={notice()} class="px-3 py-2 text-xs" />
							</dd>
						)}
					</Show>
					<Show
						when={!props.referenceLater}
						fallback={
							<Show when={props.paymentMethod !== "cash"}>
								<dd class="mt-1.5 rounded-lg bg-warning px-2.5 py-1.5 text-xs font-medium text-warning-foreground">
									Paying later: no reference number yet. Don’t forget to send it
									after you pay, or your order stays on hold.
								</dd>
							</Show>
						}
					>
						<Show when={typeof reference === "string" && reference}>
							<dd class="mt-1.5 rounded-lg bg-petal-50 px-2.5 py-1.5">
								<span class="block text-xs text-petal-900/60">
									Reference number
								</span>
								<span class="block font-mono text-base font-semibold tracking-wide">
									{String(reference)}
								</span>
								<span class="block text-xs text-petal-900/60">
									Make sure it matches your receipt.
								</span>
							</dd>
						</Show>
					</Show>
				</div>
				<ReviewEdit
					label="your payment"
					onClick={() => props.onEdit(PAYMENT_SECTION)}
				/>
			</div>
		</dl>
	);
}

function ReviewEdit(props: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={props.onClick}
			class="-my-2 min-h-10 shrink-0 rounded-full px-2 text-sm font-medium text-petal-700 underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
		>
			Edit<span class="sr-only"> {props.label}</span>
		</button>
	);
}

function Section(props: {
	id?: string;
	title: string;
	/** A word after the title, e.g. "Optional". */
	note?: string;
	step: number;
	children: JSX.Element;
}) {
	return (
		<section
			id={props.id}
			tabIndex={props.id ? -1 : undefined}
			class="scroll-mt-28 rounded-3xl border border-petal-100 bg-white p-6 outline-none"
		>
			<h2 class="mb-4 flex items-center gap-3 font-display type-soft text-xl font-semibold">
				<span
					aria-hidden="true"
					class="flex size-7 items-center justify-center rounded-full bg-petal-100 font-sans text-sm text-petal-700"
				>
					{props.step}
				</span>
				{props.title}
				<Show when={props.note}>
					<span class="font-sans text-sm font-normal text-petal-900/50">
						{props.note}
					</span>
				</Show>
			</h2>
			{props.children}
		</section>
	);
}

function Field(props: {
	name: CheckoutField;
	label: string;
	type?: "text" | "email";
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
				type={props.type ?? "text"}
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
