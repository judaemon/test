import type { JSX } from "solid-js";
import { createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";

import {
	TextField,
	TextFieldDescription,
	TextFieldErrorMessage,
	TextFieldInput,
	TextFieldLabel,
} from "~/components/ui/text-field";
import type { FieldErrors, PaymentField } from "~/lib/checkout";
import {
	CARD_BRAND_LABELS,
	type CardInput,
	cardDigits,
	detectCardBrand,
	formatCardNumber,
	formatExpiry,
	ON_HOLD_NOTICE,
	type PaymentMethod,
	type QrPaymentMethod,
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
	onMethodChange: (method: PaymentMethod) => void;
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
									onChange={() => {
										props.onMethodChange(account.method);
										props.clearError("paymentMethod");
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

			<Switch>
				<Match when={props.method === "card"}>
					<CardFields
						card={props.card}
						onCardChange={props.onCardChange}
						errors={props.errors}
						clearError={props.clearError}
					/>
				</Match>
				<Match when={props.method !== "card" && props.method}>
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

	return (
		<div class="flex flex-col gap-5">
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

			<Show when={props.onReferenceLaterChange}>
				<label class="flex cursor-pointer items-start gap-3 rounded-2xl border border-petal-200 px-4 py-3 text-sm has-[:checked]:border-petal-700 has-[:checked]:bg-petal-50">
					<input
						type="checkbox"
						checked={props.referenceLater ?? false}
						onChange={(e) => {
							props.onReferenceLaterChange?.(e.currentTarget.checked);
							props.clearError("referenceNumber");
						}}
						class="mt-0.5 size-5 shrink-0 accent-petal-700"
					/>
					<span>
						<span class="block font-medium">Reference number to follow</span>
						<span class="text-petal-900/65">
							Pay later and send it from Check your order or by signing in.
						</span>
					</span>
				</label>
			</Show>

			<Show
				when={!props.referenceLater}
				fallback={
					<p class="rounded-2xl bg-warning px-4 py-3 text-sm text-warning-foreground">
						{ON_HOLD_NOTICE}
					</p>
				}
			>
				<TextField
					name="referenceNumber"
					validationState={props.errors.referenceNumber ? "invalid" : "valid"}
					class="gap-2"
				>
					<TextFieldLabel class="text-petal-900">
						Reference number
					</TextFieldLabel>
					<TextFieldInput
						autocomplete="off"
						autocapitalize="characters"
						spellcheck={false}
						placeholder="e.g. 1234 567 891011"
						onInput={() => props.clearError("referenceNumber")}
						class={cn(inputClass, "tabular-nums")}
					/>
					<Show when={!props.errors.referenceNumber}>
						<TextFieldDescription class="text-xs text-petal-900/55">
							Shown on your {account().label} receipt as “Ref No.”
						</TextFieldDescription>
					</Show>
					<TextFieldErrorMessage>
						{props.errors.referenceNumber}
					</TextFieldErrorMessage>
				</TextField>
			</Show>
		</div>
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

function BankIcon(props: { class?: string }) {
	return (
		<svg aria-hidden="true" {...iconBase} class={props.class}>
			<path d="M3 21h18M5 21v-9M19 21v-9M9.5 21v-9M14.5 21v-9M3 9l9-6 9 6Z" />
		</svg>
	);
}
