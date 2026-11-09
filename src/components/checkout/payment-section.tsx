import type { JSX } from "solid-js";
import {
	createSignal,
	For,
	Match,
	onCleanup,
	onMount,
	Show,
	Switch,
} from "solid-js";
import { PaymentNotice } from "~/components/checkout/payment-notice";
import {
	TextField,
	TextFieldDescription,
	TextFieldErrorMessage,
	TextFieldInput,
	TextFieldLabel,
} from "~/components/ui/text-field";
import type { FieldErrors, PaymentField } from "~/lib/checkout";
import { ORDER_EDIT_HOW, ORDER_EDIT_RULE } from "~/lib/order-edit";
import {
	CARD_BRAND_LABELS,
	CASH_NOTICE,
	type CardInput,
	cardDigits,
	detectCardBrand,
	formatCardNumber,
	formatExpiry,
	ON_HOLD_NOTICE,
	type PaymentMethod,
	type QrPaymentMethod,
	REFERENCE_REMINDER,
	validateReferenceNumber,
} from "~/lib/payment";
import { formatPrice } from "~/lib/product";
import { cn } from "~/lib/utils";
import type { PaymentAccount } from "~/types/payment";

interface PaymentSectionProps {
	/** Enabled methods, in display order. */
	accounts: PaymentAccount[];
	total: number;
	currency: string;
	method: PaymentMethod | null;
	/** May not pick it straight away, e.g. to warn first that it misses a sale. */
	onMethodChange: (method: PaymentMethod) => void;
	/** Ways to pay that miss a sale or promo, and what to call it: "No November Sale". */
	missed?: Partial<Record<PaymentMethod, string>>;
	card: CardInput;
	onCardChange: (patch: Partial<CardInput>) => void;
	errors: FieldErrors;
	clearError: (field: PaymentField) => void;
	/** "To follow": the shopper will send the reference number later. */
	referenceLater?: boolean;
	/** Leave out where the reference number can't wait, like the pay page. */
	onReferenceLaterChange?: (later: boolean) => void;
}

const METHOD_DISPLAY: Record<
	PaymentMethod,
	{ hint: (account: PaymentAccount) => string; badge: () => JSX.Element }
> = {
	card: {
		hint: () => "Visa, Mastercard, JCB, Amex",
		badge: () => <CardIcon class="size-5" />,
	},
	gcash: {
		hint: (account) => (account.qrImage ? "Scan to pay" : "Send money"),
		badge: () => <Monogram letter="G" class="bg-[#007dfe]" />,
	},
	maya: {
		hint: (account) => (account.qrImage ? "Scan to pay" : "Send money"),
		badge: () => <Monogram letter="M" class="bg-[#00a85a]" />,
	},
	bank: {
		hint: (account) => account.bankName || "InstaPay / QR Ph",
		badge: () => <BankIcon class="size-5" />,
	},
	cash: {
		hint: () => "Pay in person · cadets only",
		badge: () => <CashIcon class="size-5" />,
	},
};

const inputClass =
	"h-11 rounded-xl border-petal-200 bg-white text-base placeholder:text-petal-900/35 focus-visible:ring-petal-500 sm:text-sm";

export function PaymentSection(props: PaymentSectionProps) {
	return (
		<div class="flex flex-col gap-5">
			<fieldset aria-describedby="payment-method-error">
				<legend class="sr-only">Payment method</legend>
				<div class="grid gap-2 sm:grid-cols-2">
					<For each={props.accounts}>
						{(account) => (
							<label class="cursor-pointer">
								<input
									type="radio"
									name="paymentMethod"
									value={account.method}
									checked={props.method === account.method}
									aria-invalid={props.errors.paymentMethod ? "true" : undefined}
									onChange={(event) => {
										props.onMethodChange(account.method);
										props.clearError("paymentMethod");
										// Until it's confirmed (if asked first), the choice before
										// stays ticked.
										for (const radio of event.currentTarget
											.closest("fieldset")
											?.querySelectorAll<HTMLInputElement>(
												'input[name="paymentMethod"]',
											) ?? [])
											radio.checked = radio.value === props.method;
									}}
									class="peer sr-only"
								/>
								<span class="flex h-full items-center gap-3 rounded-2xl border border-petal-200 bg-white px-4 py-3 transition-colors hover:border-petal-300 peer-checked:border-petal-700 peer-checked:bg-petal-50 peer-checked:shadow-[inset_0_0_0_1px] peer-checked:shadow-petal-700 peer-focus-visible:ring-2 peer-focus-visible:ring-petal-500 peer-focus-visible:ring-offset-2">
									<span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-petal-50 text-petal-700">
										{METHOD_DISPLAY[account.method].badge()}
									</span>
									<span class="flex flex-col">
										<span class="font-medium">{account.label}</span>
										<span class="text-xs text-petal-900/60">
											{METHOD_DISPLAY[account.method].hint(account)}
										</span>
										<Show when={props.missed?.[account.method]}>
											{(missed) => (
												<span class="mt-1 w-fit rounded-full bg-sale/10 px-2 py-0.5 text-xs font-semibold text-sale">
													{missed()}
												</span>
											)}
										</Show>
									</span>
								</span>
							</label>
						)}
					</For>
				</div>
				<Show when={props.errors.paymentMethod}>
					<p id="payment-method-error" class="mt-2 text-xs text-destructive">
						{props.errors.paymentMethod}
					</p>
				</Show>
			</fieldset>

			{/* The chosen method's warning from Admin → Payments, if it has one. */}
			<Show
				when={
					props.accounts.find((account) => account.method === props.method)
						?.notice
				}
			>
				{(notice) => <PaymentNotice text={notice()} />}
			</Show>
			<Show when={props.method && props.missed?.[props.method]}>
				{(missed) => (
					<PaymentNotice
						text={`${missed()} with this payment method. Choose another way to pay to get the discount.`}
					/>
				)}
			</Show>

			<Switch>
				<Match when={props.method === "card"}>
					<CardFields
						card={props.card}
						onCardChange={props.onCardChange}
						errors={props.errors}
						clearError={props.clearError}
					/>
				</Match>
				<Match when={props.method === "cash"}>
					<div class="flex flex-col gap-2 rounded-2xl bg-petal-50 p-5">
						<div>
							<p class="text-sm text-petal-900/65">Amount to pay</p>
							<p class="font-display type-soft text-3xl font-semibold tabular-nums">
								{formatPrice(props.total, props.currency)}
							</p>
						</div>
						<p class="text-sm text-petal-900/75">{CASH_NOTICE}</p>
						<p class="text-sm text-petal-900/60">
							{ORDER_EDIT_RULE} {ORDER_EDIT_HOW}
						</p>
					</div>
				</Match>
				<Match
					when={
						props.method !== "card" && props.method !== "cash" && props.method
					}
				>
					{(method) => (
						<QrPayment
							method={method() as QrPaymentMethod}
							account={
								props.accounts.find(
									(a) => a.method === method(),
								) as PaymentAccount
							}
							total={props.total}
							currency={props.currency}
							errors={props.errors}
							clearError={props.clearError}
							referenceLater={props.referenceLater}
							onReferenceLaterChange={props.onReferenceLaterChange}
						/>
					)}
				</Match>
			</Switch>
		</div>
	);
}

function CardFields(props: {
	card: CardInput;
	onCardChange: (patch: Partial<CardInput>) => void;
	errors: FieldErrors;
	clearError: (field: PaymentField) => void;
}) {
	const brand = () => detectCardBrand(cardDigits(props.card.number));

	// The checkout builds its request from an allowlist, so these values stay in
	// the browser — only the brand and last four digits are sent.
	return (
		<div class="grid gap-4 rounded-2xl bg-petal-50 p-5 sm:grid-cols-2">
			<TextField
				value={props.card.number}
				onChange={(value) => {
					props.onCardChange({ number: formatCardNumber(value) });
					props.clearError("cardNumber");
				}}
				validationState={props.errors.cardNumber ? "invalid" : "valid"}
				class="gap-2 sm:col-span-2"
			>
				<TextFieldLabel class="text-petal-900">Card number</TextFieldLabel>
				<div class="relative">
					<TextFieldInput
						inputMode="numeric"
						autocomplete="cc-number"
						placeholder="1234 5678 9012 3456"
						maxLength={23}
						class={cn(inputClass, "pr-24 tabular-nums")}
					/>
					<Show when={brand() !== "unknown"}>
						<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-petal-100 px-2 py-0.5 text-xs font-medium text-petal-700">
							{CARD_BRAND_LABELS[brand()]}
						</span>
					</Show>
				</div>
				<TextFieldErrorMessage>{props.errors.cardNumber}</TextFieldErrorMessage>
			</TextField>

			<TextField
				value={props.card.name}
				onChange={(value) => {
					props.onCardChange({ name: value });
					props.clearError("cardName");
				}}
				validationState={props.errors.cardName ? "invalid" : "valid"}
				class="gap-2 sm:col-span-2"
			>
				<TextFieldLabel class="text-petal-900">Name on card</TextFieldLabel>
				<TextFieldInput autocomplete="cc-name" class={inputClass} />
				<TextFieldErrorMessage>{props.errors.cardName}</TextFieldErrorMessage>
			</TextField>

			<TextField
				value={props.card.expiry}
				onChange={(value) => {
					props.onCardChange({ expiry: formatExpiry(value) });
					props.clearError("cardExpiry");
				}}
				validationState={props.errors.cardExpiry ? "invalid" : "valid"}
				class="gap-2"
			>
				<TextFieldLabel class="text-petal-900">Expiry</TextFieldLabel>
				<TextFieldInput
					inputMode="numeric"
					autocomplete="cc-exp"
					placeholder="MM/YY"
					maxLength={5}
					class={cn(inputClass, "tabular-nums")}
				/>
				<TextFieldErrorMessage>{props.errors.cardExpiry}</TextFieldErrorMessage>
			</TextField>

			<TextField
				value={props.card.cvc}
				onChange={(value) => {
					props.onCardChange({ cvc: cardDigits(value).slice(0, 4) });
					props.clearError("cardCvc");
				}}
				validationState={props.errors.cardCvc ? "invalid" : "valid"}
				class="gap-2"
			>
				<TextFieldLabel class="text-petal-900">Security code</TextFieldLabel>
				<TextFieldInput
					inputMode="numeric"
					autocomplete="cc-csc"
					placeholder={brand() === "amex" ? "4 digits" : "3 digits"}
					maxLength={4}
					class={cn(inputClass, "tabular-nums")}
				/>
				<TextFieldErrorMessage>{props.errors.cardCvc}</TextFieldErrorMessage>
			</TextField>

			<p class="text-xs text-petal-900/60 sm:col-span-2">
				Test mode: cards aren’t charged yet, and the full card number never
				leaves your browser.
			</p>
		</div>
	);
}

function QrPayment(props: {
	method: QrPaymentMethod;
	account: PaymentAccount;
	total: number;
	currency: string;
	errors: FieldErrors;
	clearError: (field: PaymentField) => void;
	referenceLater?: boolean;
	onReferenceLaterChange?: (later: boolean) => void;
}) {
	const account = () => props.account;
	const [reference, setReference] = createSignal("");
	const looksRight = () =>
		!!reference().trim() && !validateReferenceNumber(reference());
	const error = () => props.errors.referenceNumber;
	let referenceInput: HTMLInputElement | undefined;
	const setLater = (later: boolean) => {
		props.onReferenceLaterChange?.(later);
		props.clearError("referenceNumber");
		// Back to paying now: straight to the box they need to fill.
		if (!later) requestAnimationFrame(() => referenceInput?.focus());
	};
	// Phones copy the number from the receipt; one tap puts it in. Checked once
	// the page is running in the browser, so the server's page matches.
	const [canPaste, setCanPaste] = createSignal(false);
	onMount(() => setCanPaste(!!navigator.clipboard?.readText));
	const paste = async () => {
		try {
			const text = (await navigator.clipboard.readText()).trim().slice(0, 40);
			if (!text) return;
			setReference(text);
			props.clearError("referenceNumber");
			referenceInput?.focus();
		} catch {
			// Blocked or empty clipboard: they can still type it.
		}
	};

	return (
		<div class="flex flex-col gap-4">
			<StepHeading number={1}>
				Send {formatPrice(props.total, props.currency)} by {account().label}
			</StepHeading>
			<div
				class={cn(
					"grid gap-5 rounded-2xl bg-petal-50 p-5",
					account().qrImage && "sm:grid-cols-[180px_minmax(0,1fr)]",
				)}
			>
				{/* Without a QR code the account details below are enough to pay. */}
				<Show when={account().qrImage}>
					<div class="flex flex-col items-center gap-2">
						<img
							src={account().qrImage}
							alt={`${account().label} QR code for ${account().accountName}`}
							width={180}
							height={180}
							class="w-44 rounded-2xl border border-petal-100 bg-white p-3 sm:w-full"
						/>
						<a
							href={account().qrImage}
							download={`oraia-${props.method}-qr.${account().qrImage.split(".").pop()}`}
							class="rounded-full px-3 py-1 text-sm font-medium text-petal-700 underline-offset-4 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							Save QR image
						</a>
					</div>
				</Show>

				<div class="flex min-w-0 flex-col gap-4">
					<div>
						<p class="text-sm text-petal-900/65">Amount to pay</p>
						<div class="flex items-center gap-3">
							<p class="font-display type-soft text-3xl font-semibold tabular-nums">
								{formatPrice(props.total, props.currency)}
							</p>
							<CopyButton value={String(props.total)} label="Copy amount" />
						</div>
					</div>

					<dl class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 text-sm">
						<Show when={account().bankName}>
							<dt class="text-petal-900/60">Bank</dt>
							<dd class="font-medium">{account().bankName}</dd>
						</Show>
						<dt class="text-petal-900/60">Account name</dt>
						<dd class="font-medium">{account().accountName}</dd>
						<dt class="text-petal-900/60">
							{props.method === "bank" ? "Account no." : "Number"}
						</dt>
						<dd class="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium tabular-nums">
							<span class="whitespace-nowrap">{account().accountNumber}</span>
							<CopyButton
								value={account().accountNumber.replace(/\s/g, "")}
								label="Copy number"
							/>
						</dd>
					</dl>

					<ol class="flex list-decimal flex-col gap-1 pl-5 text-sm text-petal-900/75 marker:text-petal-500">
						<For each={account().steps}>{(step) => <li>{step}</li>}</For>
					</ol>
				</div>
			</div>

			<Show
				when={!props.referenceLater}
				fallback={
					<div class="flex flex-col gap-2 rounded-2xl border-2 border-warning-foreground/40 bg-warning px-4 py-4 text-sm text-warning-foreground">
						<p class="flex items-center gap-2 font-semibold">
							<AlertIcon class="size-5 shrink-0" />
							You’re paying later
						</p>
						<p>
							{ON_HOLD_NOTICE} Don’t forget to send your{" "}
							<strong class="font-semibold">reference number</strong> from your
							order page or Check your order. We can’t start on your bouquets
							without it.
						</p>
						<p class="text-warning-foreground/85">
							{ORDER_EDIT_RULE} {ORDER_EDIT_HOW}
						</p>
						<button
							type="button"
							onClick={() => setLater(false)}
							class="mt-1 self-start rounded-full border border-warning-foreground/40 bg-white px-4 py-2 font-medium text-petal-900 transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							I’ve paid: enter my reference number
						</button>
					</div>
				}
			>
				<StepHeading number={2}>Enter your reference number</StepHeading>
				<div
					class={cn(
						"flex flex-col gap-3 rounded-2xl border-2 bg-white p-4 sm:p-5",
						error()
							? "border-destructive"
							: looksRight()
								? "border-success-foreground/50"
								: "border-petal-700/60",
					)}
				>
					<p class="flex items-start gap-2 rounded-xl bg-warning px-3 py-2.5 text-sm font-semibold text-warning-foreground">
						<AlertIcon class="mt-px size-5 shrink-0" />
						{REFERENCE_REMINDER}
					</p>
					<TextField
						name="referenceNumber"
						value={reference()}
						onChange={(value) => {
							setReference(value);
							props.clearError("referenceNumber");
						}}
						validationState={error() ? "invalid" : "valid"}
						class="gap-2"
					>
						<TextFieldLabel class="text-petal-900">
							{account().label} reference number
						</TextFieldLabel>
						<div class="flex gap-2">
							<TextFieldInput
								ref={referenceInput}
								autocomplete="off"
								autocapitalize="characters"
								spellcheck={false}
								inputMode="text"
								placeholder="e.g. 1234 567 890"
								class={cn(
									inputClass,
									"h-12 flex-1 text-lg tracking-wide tabular-nums sm:text-base",
								)}
							/>
							<Show when={canPaste()}>
								<button
									type="button"
									onClick={paste}
									class="h-12 shrink-0 rounded-xl border border-petal-200 bg-white px-4 text-sm font-medium text-petal-700 transition-colors hover:bg-petal-50 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
								>
									Paste
								</button>
							</Show>
						</div>
						<Show
							when={!error()}
							fallback={
								<TextFieldErrorMessage>{error()}</TextFieldErrorMessage>
							}
						>
							<Show
								when={looksRight()}
								fallback={
									<TextFieldDescription class="text-xs text-petal-900/60">
										After you send the payment, it’s the{" "}
										<strong class="font-semibold">“Ref No.”</strong> on your{" "}
										{account().label} receipt.
									</TextFieldDescription>
								}
							>
								<TextFieldDescription class="flex items-center gap-1.5 text-xs font-medium text-success-foreground">
									<CheckIcon class="size-4" />
									Looks right. Check it matches your receipt.
								</TextFieldDescription>
							</Show>
						</Show>
					</TextField>
				</div>

				<Show when={props.onReferenceLaterChange}>
					<p class="text-sm text-petal-900/65">
						Haven’t paid yet?{" "}
						<button
							type="button"
							onClick={() => setLater(true)}
							class="rounded font-medium text-petal-700 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
						>
							Pay later
						</button>{" "}
						and send your reference number from your order page.
					</p>
				</Show>
			</Show>
		</div>
	);
}

/** A numbered step inside the payment section. */
function StepHeading(props: { number: number; children: JSX.Element }) {
	return (
		<p class="flex items-center gap-2.5 font-medium">
			<span
				aria-hidden="true"
				class="flex size-6 shrink-0 items-center justify-center rounded-full bg-petal-700 text-xs font-semibold text-white"
			>
				{props.number}
			</span>
			<span>
				<span class="sr-only">Step {props.number}: </span>
				{props.children}
			</span>
		</p>
	);
}

function AlertIcon(props: { class?: string }) {
	return (
		<svg aria-hidden="true" {...iconBase} class={props.class}>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7.5v5M12 16.5h.01" />
		</svg>
	);
}

function CheckIcon(props: { class?: string }) {
	return (
		<svg aria-hidden="true" {...iconBase} class={props.class}>
			<path d="m5 12.5 4.5 4.5L19 7.5" />
		</svg>
	);
}

function CopyButton(props: { value: string; label: string }) {
	const [copied, setCopied] = createSignal(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(timer));

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(props.value);
			setCopied(true);
			clearTimeout(timer);
			timer = setTimeout(() => setCopied(false), 1800);
		} catch {
			// Clipboard can be blocked; the value is still on screen to copy by hand.
		}
	};

	return (
		<button
			type="button"
			onClick={copy}
			class="shrink-0 rounded-full border border-petal-200 bg-white px-2.5 py-0.5 text-xs font-medium text-petal-700 transition-colors hover:bg-petal-100 outline-none focus-visible:ring-2 focus-visible:ring-petal-500"
		>
			<span aria-live="polite">{copied() ? "Copied!" : props.label}</span>
		</button>
	);
}

function Monogram(props: { letter: string; class: string }) {
	return (
		<span
			aria-hidden="true"
			class={cn(
				"flex size-7 items-center justify-center rounded-full text-sm font-bold text-white",
				props.class,
			)}
		>
			{props.letter}
		</span>
	);
}

const iconBase = {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "1.8",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

function CardIcon(props: { class?: string }) {
	return (
		<svg aria-hidden="true" {...iconBase} class={props.class}>
			<rect x="3" y="5" width="18" height="14" rx="3" />
			<path d="M3 10h18M7 15h3" />
		</svg>
	);
}

function CashIcon(props: { class?: string }) {
	return (
		<svg aria-hidden="true" {...iconBase} class={props.class}>
			<rect x="2" y="6" width="20" height="12" rx="2" />
			<circle cx="12" cy="12" r="2.5" />
			<path d="M6 12h.01M18 12h.01" />
		</svg>
	);
}

function BankIcon(props: { class?: string }) {
	return (
		<svg aria-hidden="true" {...iconBase} class={props.class}>
			<path d="M3 21h18M5 21v-9M19 21v-9M9.5 21v-9M14.5 21v-9M3 9l9-6 9 6Z" />
		</svg>
	);
}
